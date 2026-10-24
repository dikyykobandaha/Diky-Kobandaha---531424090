import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import type { DependencyType, TaskStatus, TaskPriority } from '../types/api';

export interface PertDiagramProps {
  nodes: {
    id: string;
    title: string;
    duration: number;
    isMilestone: boolean;
    priority: TaskPriority;
    status: TaskStatus;
    progress: number;
    startDate?: string | null;
    endDate?: string | null;
    es?: number | null;
    ef?: number | null;
    ls?: number | null;
    lf?: number | null;
    float?: number | null;
    isCritical: boolean;
    assignee?: { id: string; name: string } | null;
  }[];
  edges: {
    id: string;
    from: string;
    to: string;
    type: DependencyType;
    lagWorkDays: number;
    fromTitle: string;
    toTitle: string;
  }[];
  cpm?: {
    projectDurationDays: number | null;
    criticalTaskIds: string[];
    criticalPaths: string[][];
  };
  topologicalOrder?: string[];
  onNodeSelect?: (taskId: string | null) => void;
  selectedNodeId?: string | null;
  onNodeDoubleClick?: (taskId: string) => void;
  layout?: 'top-down' | 'left-right';
  compact?: boolean;
  height?: number;
  width?: number;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: '#9ca3af',
  in_progress: '#3b82f6',
  delayed: '#ef4444',
  done: '#10b981',
  cancelled: '#6b7280',
};

interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function useLayout(nodes: NodePosition[], edges: any[], layout: 'top-down' | 'left-right') {
  const [positions, setPositions] = useState<NodePosition[]>(() =>
    computeLayout(nodes, edges, layout)
  );

  useEffect(() => {
    setPositions(computeLayout(nodes, edges, layout));
  }, [nodes, edges, layout]);

  return positions;
}

function computeLayout(nodes: NodePosition[], edges: any[], layout: 'top-down' | 'left-right'): NodePosition[] {
  // Simple layered layout
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }

  for (const e of edges) {
    if (nodeMap.has(e.from) && nodeMap.has(e.to)) {
      adj.get(e.from)!.push(e.to);
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
  }

  // Topological levels
  const levels = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDeg.entries()) {
    if (deg === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLevel = levels.get(cur) ?? 0;
    for (const next of adj.get(cur) ?? []) {
      const nextLevel = Math.max(levels.get(next) ?? 0, curLevel + 1);
      levels.set(next, nextLevel);
      const nextDeg = inDeg.get(next) ?? 0;
      if (nextDeg === 1) {
        inDeg.set(next, 0);
        queue.push(next);
      } else {
        inDeg.set(next, nextDeg - 1);
      }
    }
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels.entries()) {
    const list = levelGroups.get(level) ?? [];
    list.push(id);
    levelGroups.set(level, list);
  }

  const nodeWidth = 140;
  const nodeHeight = 60;
  const hGap = 60;
  const vGap = 80;

  const result: NodePosition[] = [];

  for (const [level, ids] of levelGroups.entries()) {
    let xOffset = layout === 'left-right' ? 50 : 50;
    if (layout === 'top-down') {
      xOffset = 50;
    }

    ids.forEach((id, i) => {
      const x = layout === 'left-right' ? xOffset : xOffset + i * (nodeWidth + hGap);
      const y = layout === 'top-down' ? level * (nodeHeight + vGap) + 50 : 50;
      result.push({
        id,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  // Recalculate for left-right
  if (layout === 'left-right') {
    const levelGroups2 = new Map<number, string[]>();
    for (const [id, level] of levels.entries()) {
      const list = levelGroups2.get(level) ?? [];
      list.push(id);
      levelGroups2.set(level, list);
    }

    const newResult: NodePosition[] = [];
    for (const [level, ids] of levelGroups2.entries()) {
      ids.forEach((id, i) => {
        const existing = result.find((n) => n.id === id);
        if (existing) {
          const x = 50 + level * (nodeWidth + hGap);
          newResult.push({ ...existing, x, y: i * (nodeHeight + vGap) + 50 });
        }
      });
    }
    return newResult.length > 0 ? newResult : result;
  }

  return result;
}

export default function PertDiagram({
  nodes,
  edges,
  cpm,
  onNodeSelect,
  selectedNodeId,
  onNodeDoubleClick,
  layout = 'top-down',
  compact = false,
  height = 500,
  width = 900,
}: PertDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: any } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });

  const nodePositions = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      x: 0,
      y: 0,
      width: compact ? 100 : 140,
      height: compact ? 40 : 60,
    }));
  }, [nodes, compact]);

  const positionedNodes = useLayout(nodePositions, edges, layout);

  const criticalSet = useMemo(() => {
    if (!cpm) return new Set<string>();
    return new Set(cpm.criticalTaskIds);
  }, [cpm]);

  const nodeMap = useMemo(() => {
    return new Map(nodes.map((n) => [n.id, n]));
  }, [nodes]);

  // Calculate bounds
  const bounds = useMemo(() => {
    if (positionedNodes.length === 0) {
      return { minX: 0, minY: 0, maxX: width, maxY: height };
    }
    const minX = Math.min(...positionedNodes.map((n) => n.x));
    const minY = Math.min(...positionedNodes.map((n) => n.y));
    const maxX = Math.max(...positionedNodes.map((n) => n.x + n.width));
    const maxY = Math.max(...positionedNodes.map((n) => n.y + n.height));
    return { minX, minY, maxX, maxY };
  }, [positionedNodes]);

  const padding = 60;
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, node: any) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        node,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const panStart = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    },
    []
  );

  const handleMouseMovePan = useCallback(
    (e: React.MouseEvent) => {
      if (!panStart.current) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    panStart.current = null;
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setCamera((c) => ({
        ...c,
        scale: Math.max(0.3, Math.min(2, c.scale * delta)),
      }));
    };

    const svg = svgRef.current;
    if (svg) {
      svg.addEventListener('wheel', handleWheel, { passive: false });
      return () => svg.removeEventListener('wheel', handleWheel);
    }
  }, []);

  if (nodes.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50"
        style={{ height }}
      >
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">Belum ada tugas atau dependensi.</p>
          <p className="mt-1 text-xs text-gray-400">
            Buat tugas dan ketergantungan untuk melihat PERT Network Diagram.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Layout:</span>
          <select
            value={layout}
            onChange={() => {}}
            className="input w-auto"
          >
            <option value="top-down">Top-Down</option>
            <option value="left-right">Left-Right</option>
          </select>
          <span className="ml-4 text-sm text-gray-600">
            {nodes.length} node • {edges.length} edge
            {cpm?.projectDurationDays != null && ` • Durasi: ${cpm.projectDurationDays} hari kerja`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCamera((c) => ({ ...c, scale: Math.max(0.3, c.scale * 0.8) }))}
            className="btn-secondary text-xs py-1 px-2"
          >
            −
          </button>
          <span className="text-xs text-gray-500 w-12 text-center">{Math.round(camera.scale * 100)}%</span>
          <button
            onClick={() => setCamera((c) => ({ ...c, scale: Math.min(2, c.scale * 1.25) }))}
            className="btn-secondary text-xs py-1 px-2"
          >
            +
          </button>
          <button
            onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}
            className="btn-ghost text-xs py-1 px-2"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#dc2626' }} />
          <span className="text-gray-600">Jalur kritis</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: STATUS_COLORS['in_progress'] }} />
          <span className="text-gray-600">Sedang dikerjakan</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#fbbf24' }} />
          <span className="text-gray-600">Milestone</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded border-2 border-dashed border-gray-400" />
          <span className="text-gray-600">FS (Finish-to-Start)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded border-2 border-solid border-gray-400" />
          <span className="text-gray-600">SS (Start-to-Start)</span>
        </div>
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="rounded-lg border border-gray-200 bg-white"
        style={{ overflow: 'hidden' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMovePan}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${camera.x + padding - bounds.minX}, ${camera.y + padding - bounds.minY}) scale(${camera.scale})`}>
          {/* Background */}
          <rect x={bounds.minX - padding} y={bounds.minY - padding} width={contentWidth} height={contentHeight} fill="#fafafa" rx={4} />

          {/* Edges (draw first so they're behind nodes) */}
          {edges.map((edge) => {
            const fromNode = positionedNodes.find((n) => n.id === edge.from);
            const toNode = positionedNodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const fromX = fromNode.x + fromNode.width;
            const fromY = fromNode.y + fromNode.height / 2;
            const toX = toNode.x;
            const toY = toNode.y + toNode.height / 2;

            const isCritical = criticalSet.has(edge.from) && criticalSet.has(edge.to);
            const strokeColor = isCritical ? '#dc2626' : '#6b7280';
            const strokeWidth = isCritical ? 2 : 1.5;

            // Calculate bend point for avoiding overlap
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;

            return (
              <g key={edge.id}>
                {/* Arrow line */}
                <path
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.type === 'SS' ? '4,3' : 'none'}
                />
                {/* Arrowhead */}
                <polygon
                  points={`${toX},${toY} ${toX - 8},${toY - 4} ${toX - 8},${toY + 4}`}
                  fill={strokeColor}
                />
                {/* Lag label */}
                {edge.lagWorkDays > 0 && (
                  <text
                    x={midX}
                    y={midY - 8}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize={10}
                  >
                    +{edge.lagWorkDays} hari kerja
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {positionedNodes.map((pos) => {
            const node = nodeMap.get(pos.id);
            if (!node) return null;
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNode === node.id;
            const isCritical = criticalSet.has(node.id);
            const statusColor = STATUS_COLORS[node.status] || '#6b7280';

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={(e) => handleMouseMove(e, node)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onNodeSelect?.(node.id)}
                onDoubleClick={() => onNodeDoubleClick?.(node.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Critical path glow */}
                {isCritical && (
                  <rect
                    x={-4}
                    y={-4}
                    width={pos.width + 8}
                    height={pos.height + 8}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth={2}
                    rx={8}
                    opacity={0.6}
                  />
                )}

                {/* Node background */}
                <rect
                  x={0}
                  y={0}
                  width={pos.width}
                  height={pos.height}
                  fill={isSelected ? '#eff6ff' : isHovered ? '#f8fafc' : '#fff'}
                  stroke={isCritical ? '#dc2626' : isSelected ? '#2563eb' : '#d1d5db'}
                  strokeWidth={isCritical || isSelected ? 2 : 1}
                  rx={6}
                  filter={isCritical ? 'url(#criticalGlow)' : undefined}
                />

                {/* Milestone diamond marker */}
                {node.isMilestone && (
                  <polygon
                    points={`${pos.width / 2},0 ${pos.width - 4},${pos.height / 2} ${pos.width / 2},${pos.height} ${4},${pos.height / 2}`}
                    fill="#fbbf24"
                    stroke="#d97706"
                    strokeWidth={1}
                  />
                )}

                {/* Node content */}
                <text
                  x={pos.width / 2}
                  y={14}
                  textAnchor="middle"
                  fill="#374151"
                  fontSize={11}
                  fontWeight="600"
                >
                  {node.title.length > 18 ? node.title.slice(0, 16) + '...' : node.title}
                </text>

                {/* Duration & status */}
                <text
                  x={pos.width / 2}
                  y={pos.height - 10}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={10}
                >
                  {node.isMilestone ? 'Milestone' : `${node.duration} hari`}
                </text>

                {/* Critical indicator */}
                {isCritical && (
                  <text
                    x={pos.width / 2}
                    y={pos.height - 22}
                    textAnchor="middle"
                    fill="#dc2626"
                    fontSize={9}
                    fontWeight="bold"
                  >
                    KRITIS
                  </text>
                )}

                {/* Float indicator */}
                {node.float != null && node.float > 0 && !isCritical && (
                  <text
                    x={pos.width / 2}
                    y={pos.height - 22}
                    textAnchor="middle"
                    fill="#f59e0b"
                    fontSize={9}
                  >
                    Float: {node.float}d
                  </text>
                )}

                {/* Border color for status */}
                {!node.isMilestone && (
                  <rect
                    x={0}
                    y={0}
                    width={pos.width}
                    height={4}
                    fill={statusColor}
                    rx={6}
                    ry={6}
                  />
                )}
              </g>
            );
          })}

          {/* Filters (defs) */}
          <defs>
            <filter id="criticalGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 w-72 rounded-lg bg-gray-900 p-3 text-white shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, width - 220),
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <p className="font-medium">{tooltip.node.title}</p>
          <div className="mt-1 space-y-1 text-xs text-gray-300">
            <p>Durasi: {tooltip.node.duration} hari kerja</p>
            <p>Status: {tooltip.node.status}</p>
            <p>Progress: {tooltip.node.progress}%</p>
            {tooltip.node.es != null && (
              <p>ES: {tooltip.node.es} hari kerja</p>
            )}
            {tooltip.node.ef != null && (
              <p>EF: {tooltip.node.ef} hari kerja</p>
            )}
            {tooltip.node.float != null && (
              <p>Float: {tooltip.node.float} hari kerja</p>
            )}
            {tooltip.node.startDate && (
              <p>Mulai: {new Date(tooltip.node.startDate).toLocaleDateString('id-ID')}</p>
            )}
            {tooltip.node.endDate && (
              <p>Selesai: {new Date(tooltip.node.endDate).toLocaleDateString('id-ID')}</p>
            )}
            {tooltip.node.isMilestone && (
              <p className="text-yellow-400">⭐ Milestone</p>
            )}
            {tooltip.node.assignee && (
              <p>Penanggung jawab: {tooltip.node.assignee.name}</p>
            )}
          </div>
        </div>
      )}

      {/* Pan hint */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400">
        Geser untuk memindah • Scroll untuk zoom
      </div>
    </div>
  );
}
