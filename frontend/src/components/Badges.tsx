import { type EventStatus, type TaskStatus, type TaskPriority } from '../types/api';
import { clsx } from 'clsx';

const STATUS_LABEL: Record<EventStatus, string> = {
  planning: 'Perencanaan',
  preparation: 'Persiapan',
  running: 'Berlangsung',
  finished: 'Selesai',
  cancelled: 'Dibatalkan',
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Belum dimulai',
  in_progress: 'Sedang dikerjakan',
  delayed: 'Tertunda',
  done: 'Selesai',
  cancelled: 'Dibatalkan',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  urgent: 'Mendesak',
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={clsx(
      'badge',
      status === 'planning' ? 'bg-purple-100 text-purple-700' : ''
    )}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx(
      'badge',
      status === 'not_started' ? 'bg-gray-100 text-gray-700' : '',
      status === 'in_progress' ? 'bg-blue-100 text-blue-700' : '',
      status === 'delayed' ? 'bg-amber-100 text-amber-700' : '',
      status === 'done' ? 'bg-emerald-100 text-emerald-700' : '',
      status === 'cancelled' ? 'bg-gray-200 text-gray-600' : '',
    )}>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={clsx(
      'badge',
      priority === 'low' ? 'bg-gray-100 text-gray-700' : '',
      priority === 'medium' ? 'bg-amber-100 text-amber-700' : '',
      priority === 'high' ? 'bg-orange-100 text-orange-700' : '',
      priority === 'urgent' ? 'bg-red-100 text-red-700' : '',
    )}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusLabel({ status }: { status: EventStatus }) {
  return <span className="text-sm text-gray-600">{STATUS_LABEL[status]}</span>;
}

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  return <span className="text-sm text-gray-600">{TASK_STATUS_LABEL[status]}</span>;
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return <span className="text-sm text-gray-600">{PRIORITY_LABEL[priority]}</span>;
}
