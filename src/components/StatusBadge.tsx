import { STATUS_LABEL, type Severity } from '../inference/types';
import { Icon } from './Icon';

// Severity is conveyed by icon shape and text, not color alone.
export function StatusBadge({ severity }: { severity: Severity }) {
  const icon = severity === 'review' ? 'review' : severity === 'attention' ? 'attention' : 'info';
  return (
    <span className={`status status-${severity}`}>
      <Icon name={icon} />
      {STATUS_LABEL[severity]}
    </span>
  );
}
