"""Store Qualcomm AI Hub EasyOCR (w8a8 ONNX) weights as INT8.

The published w8a8 export keeps float32 weights and quantizes them inside the
graph (QuantizeLinear -> DequantizeLinear). This script runs each constant
QuantizeLinear once, ahead of time, and stores the integer result, so the
weights ship as 8-bit values. The math the runtime performs is unchanged.

With --dynamic-width (recognizer only), the two Reshape constants that pin
the sequence length to 199 steps become -1 and the input width becomes a
symbolic dimension, so a short line can run on a narrow strip. Output at the
original 800 px width is unchanged.

  python scripts/fold-aihub-weights.py <in.onnx> <out.onnx> [--dynamic-width]
"""
import sys

import numpy as np
import onnx
from onnx import numpy_helper


def dynamic_width(m: onnx.ModelProto) -> None:
    g = m.graph
    reshapes = {n.input[1] for n in g.node if n.op_type == 'Reshape'}
    changed = 0
    for t in g.initializer:
        if t.name in reshapes:
            a = numpy_helper.to_array(t)
            if 199 in a.tolist():
                t.CopyFrom(numpy_helper.from_array(np.where(a == 199, -1, a).astype(a.dtype), t.name))
                changed += 1
    assert changed == 2, f'expected 2 sequence-length reshapes, found {changed}'
    width = g.input[0].type.tensor_type.shape.dim[3]
    width.ClearField('dim_value')
    width.dim_param = 'width'
    steps = g.output[0].type.tensor_type.shape.dim[1]
    steps.ClearField('dim_value')
    steps.dim_param = 'steps'
    del g.value_info[:]


def fold(src: str, dst: str, dynamic: bool = False) -> None:
    m = onnx.load(src, load_external_data=True)
    g = m.graph
    inits = {t.name: t for t in g.initializer}
    keep, folded = [], 0
    for n in g.node:
        if n.op_type == 'QuantizeLinear' and n.input[0] in inits and all(i in inits for i in n.input[1:]):
            x = numpy_helper.to_array(inits[n.input[0]]).astype(np.float32)
            scale = numpy_helper.to_array(inits[n.input[1]]).astype(np.float32)
            zp = numpy_helper.to_array(inits[n.input[2]]) if len(n.input) > 2 else np.uint8(0)
            axis = next((a.i for a in n.attribute if a.name == 'axis'), 1)
            if scale.ndim == 1 and scale.size > 1:
                shape = [1] * x.ndim
                shape[axis] = -1
                scale = scale.reshape(shape)
                zp = zp.reshape(shape)
            info = np.iinfo(zp.dtype)
            q = np.clip(np.rint(x / scale) + zp.astype(np.int64), info.min, info.max).astype(zp.dtype)
            g.initializer.append(numpy_helper.from_array(q, n.output[0]))
            folded += 1
        else:
            keep.append(n)
    del g.node[:]
    g.node.extend(keep)
    used = {i for n in g.node for i in n.input} | {o.name for o in g.output}
    live = [t for t in g.initializer if t.name in used]
    del g.initializer[:]
    g.initializer.extend(live)
    if dynamic:
        dynamic_width(m)
    onnx.checker.check_model(m)
    onnx.save(m, dst)
    print(f'{dst}: folded {folded} weight quantizers' + (', dynamic width' if dynamic else ''))


if __name__ == '__main__':
    fold(sys.argv[1], sys.argv[2], '--dynamic-width' in sys.argv[3:])
