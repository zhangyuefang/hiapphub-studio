import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Loader, AlertCircle } from 'lucide-react';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface ProgressStep {
  label: string;
  status: StepStatus;
}

interface Props {
  open: boolean;
  title: string;
  steps: ProgressStep[];
  logs: string[];
  error?: string;
  done?: boolean;
  doneLabel?: string;
  waitingLabel?: string;
  onClose?: () => void;
}

export function ProgressDialog({ open, title, steps, logs, error, done, doneLabel, waitingLabel, onClose }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (done && !error) {
      const timer = setTimeout(() => setFadeOut(true), 1200);
      return () => clearTimeout(timer);
    }
    setFadeOut(false);
  }, [done, error]);

  if (!open) return null;

  return (
    <div className={`progress-overlay ${fadeOut ? 'fade-out' : ''}`}>
      <div className="progress-card">
        <h3 className="progress-title">{title}</h3>

        <div className="progress-steps">
          {steps.map((step, i) => (
            <div key={i} className={`progress-step ${step.status}`}>
              <span className="progress-step-icon">
                {step.status === 'done' && <CheckCircle size={18} />}
                {step.status === 'active' && <Loader size={18} className="spin" />}
                {step.status === 'error' && <AlertCircle size={18} />}
                {step.status === 'pending' && <span className="progress-step-dot" />}
              </span>
              <span className="progress-step-label">{step.label}</span>
              {step.status === 'done' && <span className="progress-step-check">&#10003;</span>}
            </div>
          ))}
        </div>

        <div className="progress-log" ref={logRef}>
          {logs.map((line, i) => (
            <div key={i} className="progress-log-line">{line}</div>
          ))}
          {logs.length === 0 && <div className="progress-log-line progress-log-empty">{waitingLabel || 'Waiting...'}</div>}
        </div>

        {error && (
          <div className="progress-error">
            {error}
            {onClose && <button className="progress-error-btn" onClick={onClose}>关闭</button>}
          </div>
        )}

        {done && !error && (
          <div className="progress-done">
            <CheckCircle size={20} /> {doneLabel || 'Done'}
          </div>
        )}
      </div>
    </div>
  );
}
