import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { TaskWithSchedule, DependencyType, TaskStatus, TaskPriority } from '../types/api';

export interface GanttChartProps {
  tasks: TaskWithSchedule[];
  dependencies?: { id: string; taskId: string; predecessorId: string; type: DependencyType; lagWorkDays: number }[];
  cpm?: {
    projectDurationDays: number | null;
    criticalTaskIds: string[];
    criticalPaths: string[][];
  };
  now?: Date;
  eventStart?: string;
  eventEnd?: string;
  onTaskSelect?: (taskId: string | null) => void;
  selectedTaskId?: string | null;
  onTaskDoubleClick?: (taskId: string) => void;
  filterStatus?: TaskStatus | 'all';
  filterPriority?: TaskPriority | 'all';
  filterAssigneeId?: string | null;
  zoom?: 'day' | 'week' | 'month';
  onZoomChange?: (zoom: 'day' | 'week' | 'month') => void;
  height?: number;
}


const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#9ca3af',
  in_progress: '#3b82f6',
  delayed: '#ef4444',
  done: '#10b981',
  cancelled: '#6b7280',
};

const ZOOM_DAY_WIDTH = 32;
const ZOOM_WEEK_WIDTH = 180;
const ZOOM_MONTH_WIDTH = 40;

function useDateRange(eventStart: string | undefined, eventEnd: string | undefined, zoom: string) {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const start = eventStart ? new Date(eventStart) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = eventEnd ? new Date(eventEnd) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });

  // Expand range for zoom visibility
  useEffect(() => {
    const s = new Date(dateRange.start);
    const e = new Date(dateRange.end);
    if (zoom === 'month') {
      s.setMonth(s.getMonth() - 1);
      e.setMonth(e.getMonth() + 2);
    } else if (zoom === 'week') {
      s.setDate(s.getDate() - 3);
      e.setDate(e.getDate() + 14);
    }
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    setDateRange({ start: s, end: e });
  }, [eventStart, eventEnd, zoom]);

  return dateRange;
}

export default function GanttChart({
  tasks,
  dependencies = [],
  cpm,
  now = new Date(),
  eventStart,
  eventEnd,
  onTaskSelect,
  selectedTaskId,
  onTaskDoubleClick,
  filterStatus,
  filterPriority,
  filterAssigneeId,
  zoom = 'day',
  onZoomChange,
  height = 600,
}: GanttChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; task: TaskWithSchedule } | null>(null);

  const dateRange = useDateRange(eventStart, eventEnd, zoom);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus && filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority && filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterAssigneeId && t.assigneeId !== filterAssigneeId && !t.assigneeIds?.includes(filterAssigneeId)) {
        return false;
      }
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterAssigneeId]);

  // Sort tasks: milestones first, then by startDate, then by title
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (a.isMilestone && !b.isMilestone) return -1;
      if (!a.isMilestone && b.isMilestone) return 1;
      if (a.startDate && b.startDate) {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      if (a.startDate && !b.startDate) return -1;
      if (!a.startDate && b.startDate) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filteredTasks]);

  // Build dependency map for fast lookup
  const depMap = useMemo(() => {
    const map = new Map<string, { id: string; taskId: string; predecessorId: string; type: DependencyType; lagWorkDays: number }[]>();
    for (const d of dependencies) {
      const list = map.get(d.taskId) ?? [];
      list.push(d);
      map.set(d.taskId, list);
    }
    return map;
  }, [dependencies]);

  const dayWidth = zoom === 'day' ? ZOOM_DAY_WIDTH : zoom === 'week' ? ZOOM_WEEK_WIDTH : ZOOM_MONTH_WIDTH;

  // Calculate positions
  const taskPositions = useMemo(() => {
    return sortedTasks.map((task) => {
      const startDate = task.startDate ? new Date(task.startDate) : null;
      const endDate = task.endDate ? new Date(task.endDate) : null;

      let startOffset = 0;
      let durationDays = task.durationDays;

      if (startDate && dateRange.start) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.max(0, (startDate.getTime() - dateRange.start.getTime()) / msPerDay);
        startOffset = diffDays * dayWidth;
      }

      // Calculate width based on duration (in days * dayWidth)
      // If we have both start and end dates, use the actual duration
      if (startDate && endDate) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.max(0, (endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
        durationDays = Math.max(1, Math.ceil(diffDays));
      }

      const width = durationDays * dayWidth;

      return {
        task,
        startOffset,
        width: Math.max(8, width),
        y: 0, // will be calculated in render
      };
    });
  }, [sortedTasks, dateRange, dayWidth]);

  // Calculate row height
  const rowHeight = 48;
  const headerHeight = 80;
  const totalHeight = headerHeight + sortedTasks.length * rowHeight + 20;

  // Generate time axis labels
  const timeAxis = useMemo(() => {
    const labels: { date: Date; label: string; x: number; isMajor: boolean }[] = [];
    const current = new Date(dateRange.start);

    if (zoom === 'day') {
      while (current <= dateRange.end) {
        const x = (current.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000) * dayWidth;
        const isMajor = current.getDay() === 1; // Monday
        labels.push({
          date: new Date(current),
          label: `${current.getDate()}/${current.getMonth() + 1}`,
          x,
          isMajor,
        });
        current.setDate(current.getDate() + 1);
      }
    } else if (zoom === 'week') {
      while (current <= dateRange.end) {
        const startOfWeek = new Date(current);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
        const x = (startOfWeek.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000) * dayWidth;
        labels.push({
          date: new Date(startOfWeek),
          label: `Minggu ${Math.ceil(current.getDate() / 7)}`,
          x,
          isMajor: true,
        });
        current.setDate(current.getDate() + 7);
      }
    } else {
      // Month
      while (current <= dateRange.end) {
        const x = (current.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000) * dayWidth;
        labels.push({
          date: new Date(current),
          label: current.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
          x,
          isMajor: true,
        });
        current.setMonth(current.getMonth() + 1);
      }
    }

    return labels;
  }, [dateRange, zoom, dayWidth]);

  // Calculate today marker position
  const todayX = useMemo(() => {
    if (!now) return -1;
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = (now.getTime() - dateRange.start.getTime()) / msPerDay;
    return Math.max(0, Math.min(diffDays * dayWidth, sortedTasks.length * rowHeight));
  }, [now, dateRange, dayWidth]);

  const totalWidth = Math.max(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000) * dayWidth,
    800
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, task: TaskWithSchedule, _x: number, _y: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = totalWidth / rect.width;
      const scaleY = totalHeight / rect.height;
      setTooltip({
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        task,
      });
    },
    [totalWidth, totalHeight]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const criticalSet = useMemo(() => {
    if (!cpm) return new Set<string>();
    return new Set(cpm.criticalTaskIds);
  }, [cpm]);

  return (
    <div className="relative" style={{ height }}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Zoom:</span>
          <select
            value={zoom}
            onChange={(e) => onZoomChange?.(e.target.value as any)}
            className="input w-auto"
          >
            <option value="day">Harian</option>
            <option value="week">Mingguan</option>
            <option value="month">Bulanan</option>
          </select>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            {sortedTasks.length} tugas
            {cpm?.projectDurationDays != null && ` • Durasi proyek: ${cpm.projectDurationDays} hari kerja`}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS['not_started'] }} />
          <span className="text-gray-600">Belum dimulai</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS['in_progress'] }} />
          <span className="text-gray-600">Sedang dikerjakan</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS['delayed'] }} />
          <span className="text-gray-600">Tertunda</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS['done'] }} />
          <span className="text-gray-600">Selesai</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#dc2626' }} />
          <span className="text-gray-600">Jalur kritis</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#fbbf24' }} />
          <span className="text-gray-600">Milestone</span>
        </div>
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        width={totalWidth}
        height={totalHeight}
        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
        style={{ minWidth: 800, cursor: 'default' }}
      >
        {/* Grid background */}
        <rect width={totalWidth} height={totalHeight} fill="#f9fafb" />

        {/* Today marker */}
        {todayX >= 0 && todayX < totalWidth && (
          <line
            x1={todayX}
            y1={headerHeight}
            x2={todayX}
            y2={headerHeight + sortedTasks.length * rowHeight}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="4,4"
          />
        )}

        {/* Header background */}
        <rect x={0} y={0} width={totalWidth} height={headerHeight} fill="#f3f4f6" />

        {/* Time axis */}
        {timeAxis.map((label) => (
          <g key={label.date.toISOString()}>
            {/* Grid line */}
            <line
              x1={label.x}
              y1={headerHeight}
              x2={label.x}
              y2={headerHeight + sortedTasks.length * rowHeight}
              stroke={label.isMajor ? '#d1d5db' : '#e5e7eb'}
              strokeWidth={label.isMajor ? 1 : 0.5}
            />
            {/* Label */}
            <text
              x={label.x + 4}
              y={20}
              fill={label.isMajor ? '#374151' : '#6b7280'}
              fontSize={label.isMajor ? 12 : 10}
              fontWeight={label.isMajor ? 'bold' : 'normal'}
            >
              {label.label}
            </text>
          </g>
        ))}

        {/* Header row labels */}
        <text x={8} y={40} fill="#374151" fontSize={12} fontWeight="bold">
          Tugas
        </text>

        {/* Task rows */}
        {sortedTasks.map((task, index) => {
          const rowY = headerHeight + 10 + index * rowHeight;
          const position = taskPositions[index];
          const isSelected = selectedTaskId === task.id;
          const isHovered = hoveredTask === task.id;
          const isCritical = criticalSet.has(task.id);
          const statusColor = STATUS_COLORS[task.status] || '#6b7280';

          return (
            <g
              key={task.id}
              onMouseEnter={(e) => {
                setHoveredTask(task.id);
                handleMouseMove(e, task, position.startOffset, rowY);
              }}
              onMouseLeave={handleMouseLeave}
              onClick={() => onTaskSelect?.(task.id)}
              onDoubleClick={() => onTaskDoubleClick?.(task.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Row background */}
              <rect
                x={0}
                y={rowY}
                width={totalWidth}
                height={rowHeight}
                fill={isSelected ? '#eff6ff' : isHovered ? '#f8fafc' : 'transparent'}
              />

              {/* Task label */}
              <text
                x={8}
                y={rowY + rowHeight / 2 + 4}
                fill="#374151"
                fontSize={12}
                fontWeight="500"
              >
                {task.title}
              </text>

              {/* Bar background (critical path highlight) */}
              {isCritical && (
                <rect
                  x={position.startOffset - 4}
                  y={rowY + 2}
                  width={position.width + 8}
                  height={rowHeight - 4}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={2}
                  rx={4}
                />
              )}

              {/* Task bar */}
              {position.width > 0 && (
                <rect
                  x={position.startOffset}
                  y={rowY + 8}
                  width={position.width}
                  height={rowHeight - 16}
                  fill={task.isMilestone ? '#fbbf24' : statusColor}
                  opacity={task.isMilestone ? 1 : 0.85}
                  rx={4}
                  stroke={isSelected ? '#2563eb' : 'transparent'}
                  strokeWidth={isSelected ? 2 : 0}
                />
              )}

              {/* Progress fill */}
              {!task.isMilestone && task.progress > 0 && position.width > 0 && (
                <rect
                  x={position.startOffset}
                  y={rowY + 8}
                  width={position.width * (task.progress / 100)}
                  height={rowHeight - 16}
                  fill={task.status === 'done' ? '#10b981' : '#60a5fa'}
                  opacity={0.6}
                  rx={4}
                />
              )}

              {/* Milestone diamond */}
              {task.isMilestone && position.width > 0 && (
                <polygon
                  points={`
                    ${position.startOffset + position.width / 2},${rowY + 8}
                    ${position.startOffset + position.width - 4},${rowY + rowHeight / 2}
                    ${position.startOffset + position.width / 2},${rowY + rowHeight - 8}
                    ${position.startOffset + 4},${rowY + rowHeight / 2}
                  `}
                  fill="#fbbf24"
                  stroke="#d97706"
                  strokeWidth={1}
                />
              )}

              {/* Dependency arrows */}
              {depMap.get(task.id)?.map((dep) => {
                const predIndex = sortedTasks.findIndex((t) => t.id === dep.predecessorId);
                if (predIndex === -1) return null;
                const predPosition = taskPositions[predIndex];
                const fromX = predPosition.startOffset + predPosition.width;
                const fromY = headerHeight + 10 + predIndex * rowHeight + rowHeight / 2;
                const toX = position.startOffset;
                const toY = rowY + rowHeight / 2;

                return (
                  <g key={dep.id}>
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={toX - 5}
                      y2={toY}
                      stroke="#6b7280"
                      strokeWidth={1.5}
                    />
                    <polygon
                      points={`
                        ${toX - 5},${toY}
                        ${toX - 10},${toY - 4}
                        ${toX - 10},${toY + 4}
                      `}
                      fill="#6b7280"
                    />
                  </g>
                );
              })}

              {/* Status indicator dot */}
              <circle
                cx={position.startOffset + position.width + 8}
                cy={rowY + rowHeight / 2}
                r={4}
                fill={statusColor}
              />
            </g>
          );
        })}

        {/* Empty state */}
        {sortedTasks.length === 0 && (
          <text
            x={totalWidth / 2}
            y={totalHeight / 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={14}
          >
            Belum ada tugas. Buat tugas untuk melihat Gantt Chart.
          </text>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 w-64 rounded-lg bg-gray-900 p-3 text-white shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, totalWidth - 200),
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <p className="font-medium">{tooltip.task.title}</p>
          <div className="mt-1 space-y-1 text-xs text-gray-300">
            <p>Status: {tooltip.task.status}</p>
            <p>Prioritas: {tooltip.task.priority}</p>
            <p>Progress: {tooltip.task.progress}%</p>
            {tooltip.task.startDate && (
              <p>Mulai: {new Date(tooltip.task.startDate).toLocaleDateString('id-ID')}</p>
            )}
            {tooltip.task.endDate && (
              <p>Selesai: {new Date(tooltip.task.endDate).toLocaleDateString('id-ID')}</p>
            )}
            {tooltip.task.isMilestone && <p className="text-yellow-400">Milestone</p>}
          </div>
        </div>
      )}

      {/* Vertical scroll for many tasks */}
      {sortedTasks.length * rowHeight > 400 && (
        <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white to-transparent" />
      )}
    </div>
  );
}
