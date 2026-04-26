import { AlertLevel } from '../metrics.service';

export class CreateAlertRuleDto {
  id: string;
  name: string;
  description: string;
  level: AlertLevel;
  metric: string;
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  duration?: number;
  labels?: Record<string, string>;
}
