/**
 * Tipe respons envelope API EventFlow.
 * Backend mengembalikan { data, message? } untuk sukses, dan { message, errors? } untuk error.
 */

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  errors?: string[];
  code?: string;
}

/** Status acara */
export type EventStatus =
  | 'planning'   // perencanaan
  | 'preparation'// persiapan
  | 'running'    // berlangsung
  | 'finished'   // selesai
  | 'cancelled'; // dibatalkan

/** Status tugas */
export type TaskStatus =
  | 'not_started'   // belum dimulai
  | 'in_progress'   // sedang dikerjakan
  | 'delayed'       // tertunda
  | 'done'          // selesai
  | 'cancelled';    // dibatalkan

/** Prioritas tugas */
export type TaskPriority =
  | 'low'     // rendah
  | 'medium'  // sedang
  | 'high'    // tinggi
  | 'urgent'; // mendesak

/** Jenis ketergantungan */
export type DependencyType = 'FS' | 'SS';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  createdAt?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

// ----- Organisasi & anggota -----

export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface Invitation {
  id: string;
  organizationId: string;
  code: string;
  role: 'admin' | 'member';
  invitedBy: string;
  invitedByName?: string | null;
  expiresAt?: string | null;
  usedAt?: string | null;
  createdAt: string;
}

// ----- Acara -----

export interface EventForm {
  name: string;
  description?: string;
  location?: string;
  startDate: string;     // ISO datetime YYYY-MM-DDTHH:mm
  startTime?: string;    // HH:mm (opsional, fallback start datetime)
  endDate?: string;
  endTime?: string;
  status: EventStatus;
}

export interface Event extends EventForm {
  id: string;
  organizationId: string;
  ownerId: string;
  ownerName?: string | null;
  memberIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventMemberEntry {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string } | null;
}

export interface EventWithMeta extends Event {
  memberCount?: number;
  taskCount?: number;
  progress?: number;
  members?: EventMemberEntry[];
  memberIds?: string[];
  task?: TaskWithSchedule[] | null;
  tasks?: TaskWithSchedule[];
}

// ----- Kalender kerja -----

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkCalendar {
  id: string;
  organizationId: string;
  name: string;
  workingDays: DayOfWeek[];   // default [1,2,3,4,5]
  timezone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  calendarId: string;
  name: string;
  date: string;    // YYYY-MM-DD
  createdAt: string;
}

export interface LeavePeriod {
  id: string;
  resourceId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

// ----- Tugas & subtugas -----

export interface TaskForm {
  title: string;
  description?: string;
  eventId: string;
  parentId?: string | null;
  startDate?: string;   // YYYY-MM-DD
  startTime?: string;   // HH:mm
  durationDays: number; // durasi dalam hari kerja
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;     // 0..100
  isMilestone?: boolean;
  assigneeId?: string | null;
  assigneeIds?: string[];
  estimatedCost?: number | null;
}

export interface Task extends TaskForm {
  id: string;
  createdAt: string;
  updatedAt: string;
  parent?: Task | null;
  subtasks?: Task[];
  children?: Task[];
  childrenCount?: number;
  assignee?: { id: string; name: string; email: string } | null;
  assignees?: { id: string; name: string; email: string }[];
  taskMembers?: Array<{ id: string; userId: string; user: { id: string; name: string; email: string } }>;
  event?: { id: string; name: string } | null;
}

export interface TaskWithSchedule extends Omit<Task, 'startDate' | 'startTime'> {
  startDate: string | null;
  startTime?: string | null;
  endDate: string | null;
  endTime?: string | null;
  durationDays: number;
  earliestStart?: string | null;
  earliestFinish?: string | null;
  latestStart?: string | null;
  latestFinish?: string | null;
  float?: number | null;
  isCritical?: boolean;
}

/** Payload update tugas (partial) */
export type TaskUpdate = Partial<TaskForm>;

/** Hasil CPM per tugas (mirror dari backend services/cpm) */
export interface CpmTaskResult {
  id: string;
  title: string;
  durationWorkDays: number;
  isMilestone: boolean;
  earliestStartWorkDay: number | null;
  earliestFinishWorkDay: number | null;
  latestStartWorkDay: number | null;
  latestFinishWorkDay: number | null;
  floatWorkDays: number | null;
  isCritical: boolean;
  startDateConstraint?: string | null;
  endDateConstraint?: string | null;
  predecessors: string[];
  successors: string[];
}

// ----- Analitik -----

export interface AnalyticsSummary {
  organizationId: string;
  eventCount: number;
  upcomingEventCount: number;
  runningEventCount: number;
  taskCount: number;
  notStartedTaskCount: number;
  inProgressTaskCount: number;
  doneTaskCount: number;
  delayedTaskCount: number;
  cancelledTaskCount: number;
  overallProgress: number;
  upcomingMilestones: { id: string; title: string; eventId: string; eventName?: string; dueDate: string }[];
}

export interface AssigneeWorkload {
  id: string;
  name: string;
  activeTaskCount: number;
  doneTaskCount: number;
  totalTaskCount: number;
  workloadPercent: number;
}

export interface CriticalPathItem {
  id: string;
  title: string;
  earliestStart: string | null;
  earliestFinish: string | null;
  totalFloat: number | null;
}

export interface AnalyticsData {
  summary: {
    totalTasks: number;
    doneTasks: number;
    notStartedTasks: number;
    inProgressTasks: number;
    delayedTasks: number;
    cancelledTasks: number;
    averageProgress: number;
  };
  projectProgress: number;
  taskDistribution: {
    status: Record<string, number>;
    priority: Record<string, number>;
  };
  milestones: Array<{ id: string; title: string; startDate: string | null }>;
  tasksNeedingAttention: Array<Pick<TaskWithSchedule, 'id' | 'title' | 'priority' | 'status' | 'progress'>>;
  assigneeWorkload: AssigneeWorkload[];
  criticalPath: CriticalPathItem[];
}

// ----- Dependensi -----

export interface TaskDependency {
  id: string;
  taskId: string;
  predecessorId: string;
  type: DependencyType;
  lagWorkDays: number;   // lag dalam hari kerja
  createdAt: string;
  taskTitle?: string | null;
  predecessorTitle?: string | null;
}

// ----- Sumber daya -----

export interface ResourceForm {
  name: string;
  email?: string;
  phone?: string | null;
  role?: string;
  availability?: string;     // deskripsi teks
  rate?: number | null;      // tarif opsional
  notes?: string | null;
}

export interface Resource extends ResourceForm {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceWithAssignments extends Resource {
  assignments?: ResourceAssignment[];
  taskLoad?: ResourceTaskLoad[];
}

export interface ResourceAssignment {
  id: string;
  resourceId: string;
  taskId: string;
  assignedAt: string;
  task?: TaskWithSchedule | null;
}

export interface ResourceTaskLoad {
  taskId: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  status: TaskStatus;
  isMilestone?: boolean;
  conflict?: boolean;
  note?: string;
}

// ----- CPM & analitik -----

export interface CpmTaskResult {
  taskId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  isMilestone: boolean;
  earliestStart?: string | null;
  earliestFinish?: string | null;
  latestStart?: string | null;
  latestFinish?: string | null;
  float?: number | null;
  isCritical: boolean;
  dependencyIds: string[];
}

export interface CpmResult {
  projectDurationDays: number | null;
  criticalPathIds: string[];
  criticalPaths: string[][];
  tasks: CpmTaskResult[];
  isolatedTaskIds: string[];
  errors?: string[];
}

export interface AnalyticsSummary {
  eventCount: number;
  upcomingEventCount: number;
  runningEventCount: number;
  taskCount: number;
  notStartedTaskCount: number;
  inProgressTaskCount: number;
  doneTaskCount: number;
  delayedTaskCount: number;
  overallProgress: number;
  upcomingMilestones: { id: string; title: string; eventId: string; eventName?: string; dueDate: string }[];
  recentActivity: RecentActivity[];
  memberWorkload: { member: { id: string; name: string; email: string }; assignedCount: number; inProgressCount: number; overdueCount: number }[];
}

export interface RecentActivity {
  id: string;
  type: string;
  description: string;
  entityId?: string;
  entityName?: string;
  createdAt: string;
}

export interface TaskFilter {
  eventId?: string;
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  assigneeId?: string;
  search?: string;
  startDateFrom?: string;
  startDateTo?: string;
  sort?: string;
}

