/**
 * CPM service (Critical Path Method) — backend TypeScript murni.
 *
 * Aturan yang diterapkan:
 * - Tugas diidentifikasi oleh id unik.
 * - Edge: { from, to, type: 'FS'|'SS', lagWorkDays }
 * - FS: successor earliest start >= predecessor earliest finish + lag
 * - SS: successor earliest start >= predecessor earliest start  + lag
 * - Hari kerja dihitung lewat WorkCalendar (default Senin-Friday).
 * - Milestone: durasi 0 hari kerja. Menjadi node dalam jaringan, tetap dihitung ES/EF/LS/LF.
 * - Tugas yang tidak terhubung ke jaringan utama dihitung secara independen
 *   dan DIPISAHKAN dari project duration utama (tidak ikut menentukan duration proyek,
 *   kecuali tugas tersebut terhubung ke jalur utama lewat edge lain).
 * - Float (slack) = LS - ES (sama dengan LF - EF).
 * - Critical path = set tugas dengan float == 0 (dalam batas epsilon hari kerja).
 * - Jika terdapat beberapa jalur dengan durasi sama dan float 0, semuanya dianggap
 *   critical dan dikembalikan sebagai array criticalPaths (setiap path = urutan id).
 *
 * Peringatan dokumentasi:
 * - Perhitungan dilakukan dalam SATUAN HARI KERJA (work days). Satu hari kerja = satu langkah
 *   kalender. Lag dalam satuan hari kerja.
 * - Tanggal mulai/tanggal selesai fisik dihitung dari earliest start + durasi kalender kerja.
 *
 * Referensi kontrak test (bisa diverifikasi manual):
 * - Contoh FS sederhana akan dicantumkan di file test yang berdiri sendiri.
 */

export type DependencyType = 'FS' | 'SS';

export interface TaskNode {
  /** id unik tugas */
  id: string;
  /** judul untuk debug & render */
  title: string;
  /** durasi dalam hari kerja (milestone = 0) */
  durationWorkDays: number;
  /** apakah milestone (durasi 0 dan penanda). Milestone tetap punya ES/EF. */
  isMilestone: boolean;
  /** tanggal mulai fisik opsional (YYYY-MM-DD) — jika diberikan, menjadi constraint */
  startDate?: string | null;
  /** tanggal selesai fisik opsional (YYYY-MM-DD) */
  endDate?: string | null;
}

export interface Dependency {
  from: string;
  to: string;
  type: DependencyType;
  lagWorkDays: number;
}

export interface CalendarWorkdays {
  /** index hari: 0=Minggu ... 6=Sabtu. true = hari kerja */
  byDayOfWeek: boolean[];
}

export interface CpmSchedule {
  taskId: string;
  earliestStartWorkDay: number;  // work-day index sejak 1 Jan 1970 workday basis
  earliestFinishWorkDay: number;
  latestStartWorkDay: number;
  latestFinishWorkDay: number;
  floatWorkDays: number;
}

export interface CpmResult {
  tasks: CpmTaskResult[];
  projectDurationWorkDays: number | null;
  criticalTaskIds: string[];
  criticalPaths: string[][];
  isolatedTaskIds: string[];
  errors: string[];
}

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
  /** id pendahulu dalam jaringan (untuk render PERT & traceability) */
  predecessors: string[];
  successors: string[];
}

// ---------------------------------------------------------------------------
// Kalender kerja
// ---------------------------------------------------------------------------

const DEFAULT_WORKDAYS: boolean[] = [
  false, // Minggu 0
  true,  // Senin 1
  true,  // Selasa 2
  true,  // Rabu 3
  true,  // Kamis 4
  true,  // Jumat 5
  false, // Sabtu 6
];

export function isWorkday(dayOfWeek: number, calendar?: CalendarWorkdays): boolean {
  const wd = (calendar ?? { byDayOfWeek: DEFAULT_WORKDAYS }).byDayOfWeek;
  return !!wd[dayOfWeek];
}

/**
 * Hitung berapa hari kerja (work days) antara tanggalFrom dan tanggalTo eksklusif tanggalTo.
 * Digunakan untuk menghitung durasi fisik dari work-day index.
 */
export function workDaysBetween(
  dateFrom: Date,
  dateTo: Date,
  calendar?: CalendarWorkdays
): number {
  let count = 0;
  const d = new Date(dateFrom);
  while (d < dateTo) {
    if (isWorkday(d.getDay(), calendar)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Tambahkan N hari kerja ke tanggal dari.
 * Return tanggal baru (deep copy).
 */
export function addWorkDays(dateFrom: Date, workDays: number, calendar?: CalendarWorkdays): Date {
  const d = new Date(dateFrom);
  let remaining = Math.max(0, Math.floor(workDays));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d.getDay(), calendar)) {
      remaining--;
    }
  }
  return d;
}

/**
 * Konversi tanggal ke index hari kerja absolut (dalam skala "work-day since epoch").
 * Interface internal CPM menggunakan indeks work-day relatif, bukan timestamp.
 * Fungsi ini memetakan Date -> indeks absolut untuk kebutuhan constraint tanggal mulai.
 *
 * Kita definisikan fungsi helper berikut untuk kebutuhan "offset indeks relatif terhadap
 * tanggal mulai proyek" karena konsistensi internal.
 */
export function workdayIndex(date: Date, calendar?: CalendarWorkdays): number {
  // hitung jumlah hari kerja dari epoch (1 Jan 1970) sampai date, eksklusif date
  const epoch = new Date(1970, 0, 1);
  let count = 0;
  const d = new Date(epoch);
  while (d < date) {
    if (isWorkday(d.getDay(), calendar)) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

export interface TaskGraph {
  nodes: Map<string, TaskNode>;
  edges: Dependency[];
}

export function buildGraph(tasks: TaskNode[], dependencies: Dependency[]): TaskGraph {
  const nodes = new Map<string, TaskNode>();
  for (const t of tasks) {
    nodes.set(t.id, t);
  }
  // Filter dependensi ke node yang ada
  const edges = dependencies.filter((d) => nodes.has(d.from) && nodes.has(d.to));
  return { nodes, edges };
}

/**
 * Deteksi siklus dependensi (DFS). Return true jika ada siklus.
 */
export function hasCycle(graph: TaskGraph): boolean {
  const { nodes, edges } = graph;
  const adj = new Map<string, string[]>();
  for (const n of nodes.keys()) adj.set(n, []);
  for (const e of edges) {
    const list = adj.get(e.to);
    if (list) list.push(e.from);
  }

  const state = new Map<string, number>(); // 0=unvisited,1=visiting,2=done
  for (const id of nodes.keys()) state.set(id, 0);

  function visit(nodeId: string): boolean {
    state.set(nodeId, 1);
    const preds = adj.get(nodeId) ?? [];
    for (const pred of preds) {
      const s = state.get(pred);
      if (s === 1) return true; // back edge → siklus
      if (s === 0 && visit(pred)) return true;
    }
    state.set(nodeId, 2);
    return false;
  }

  for (const id of nodes.keys()) {
    if (state.get(id) === 0 && visit(id)) return true;
  }
  return false;
}

/**
 * Return subgraph yang terhubung ke source seeds (forward traversal),
 * plus node isolated (tidak bisa dicapai dari manapun dan tidak mencapai manapun).
 *
 * Untuk CPM, kita ingin tahu node mana yang terhubung dalam jaringan utama.
 * Kita definisikan "terhubung ke jaringan utama" sebagai node yang memiliki path
 * dari node dengan tidak ada predecesor (source) ke node tanpa successor (sink),
 * atau dalam kasus tidak ada edge sama sekali, node adalah jaringan sendiri.
 *
 * Implementasi ini memisahkan:
 * - componentSet: node yang termasuk dalam komponen terbesar yang memiliki edge.
 * - isolatedTaskIds: node yang tidak punya edge sama sekali (tidak punya pred/succ).
 */
export function connectedComponents(graph: TaskGraph): { componentIdByNode: Map<string, number>; isolatedTaskIds: string[] } {
  const { nodes, edges } = graph;

  // Build adjacency undirected for connectivity (ignore direction)
  const adj = new Map<string, string[]>();
  for (const id of nodes.keys()) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }

  const componentIdByNode = new Map<string, number>();
  let compId = 0;
  const visited = new Set<string>();

  // BFS/DFS untuk undirected connectivity
  for (const id of nodes.keys()) {
    if (visited.has(id)) continue;
    const stack = [id];
    visited.add(id);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      componentIdByNode.set(cur, compId);
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    compId++;
  }

  // isolated = node yang tidak punya edge sama sekali (degree 0)
  const degree = new Map<string, number>();
  for (const id of nodes.keys()) degree.set(id, 0);
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const isolatedTaskIds: string[] = [];
  for (const [id, deg] of degree.entries()) {
    if (deg === 0) isolatedTaskIds.push(id);
  }

  return { componentIdByNode, isolatedTaskIds };
}

// ---------------------------------------------------------------------------
// Forward & Backward Pass (CPM)
// ---------------------------------------------------------------------------

const EPS = 1e-9;

export function computeCpm(
  tasks: TaskNode[],
  dependencies: Dependency[],
  calendar?: CalendarWorkdays
): CpmResult {
  const graph = buildGraph(tasks, dependencies);
  const errors: string[] = [];

  // 1. Validasi dasar: tidak ada self-loop
  for (const e of graph.edges) {
    if (e.from === e.to) {
      errors.push(`Dependensi tidak valid: tugas tidak boleh bergantung pada dirinya sendiri (${e.from}).`);
    }
  }

  // 2. Cek siklus
  if (hasCycle(graph)) {
    errors.push('Jaringan tugas mengandung siklus. Perbarui dependensi sebelum menghitung jalur kritis.');
    return {
      tasks: [],
      projectDurationWorkDays: null,
      criticalTaskIds: [],
      criticalPaths: [],
      isolatedTaskIds: [],
      errors,
    };
  }

  // 3. Connectivity
  const { componentIdByNode, isolatedTaskIds } = connectedComponents(graph);

  // Identifikasi komponen dengan edge (komponen "terhubung")
  const compHasEdge = new Map<number, boolean>();
  for (const cid of componentIdByNode.values()) compHasEdge.set(cid, false);
  if (graph.edges.length === 0) {
    // Semua node isolated
    compHasEdge.clear();
    for (const cid of componentIdByNode.values()) compHasEdge.set(cid, false);
  } else {
    for (const e of graph.edges) {
      const cid = componentIdByNode.get(e.from);
      if (cid !== undefined) compHasEdge.set(cid, true);
    }
  }

  // Tentukan komponen utama: komponen yang punya edge (jika ada), kalau tidak ada edge,
  // semua task dianggap komponen utama masing-masing (dan tidak ada critical path bersamasama).
  const primaryComponentId = compHasEdge.has(0) ? (() => {
    // Cari komponen dengan edge (hanya satu yang kita anggap "utama" supaya duration proyek
    // terdefinisi). Jika ada beberapa komponen berisi edge terpisah, kita pilih komponen dengan
    // durasi forward pass terbesar sebagai "utama" untuk tujuan project duration.
    let bestComp = -1;
    let bestFinish = -1;
    for (const [cid, hasEdge] of compHasEdge.entries()) {
      if (!hasEdge) continue;
      // hitung forward pass sementara untuk komponen ini
      const cTasks = tasks.filter((t) => componentIdByNode.get(t.id) === cid);
      const cEdges = graph.edges.filter((e) => componentIdByNode.get(e.from) === cid && componentIdByNode.get(e.to) === cid);
      const schedule = forwardPass(cTasks, cEdges, calendar);
      let maxFinish = 0;
      for (const s of schedule.values()) {
        if (s.earliestFinishWorkDay > maxFinish) maxFinish = s.earliestFinishWorkDay;
      }
      if (maxFinish > bestFinish) {
        bestFinish = maxFinish;
        bestComp = cid;
      }
    }
    return bestComp;
  })() : undefined;

  // Forward pass untuk semua node (termasuk yang terisolasi) supaya punya ES/EF terdefinisi.
  const allForward = forwardPass(tasks, graph.edges, calendar);
  const allBackward = backwardPass(tasks, graph.edges, allForward, calendar);

  // Untuk node isolated (tidak punya edge, degree=0): mereka punya forward/backward sendiri,
  // float = durasi, dan tidak ikut menentukan project duration utama.
  // Tapi kita tetap hitung dan tampilkan. Interval start dikonstrain oleh startDate jika ada.

  // Durasi proyek = (selesai paling akhir - mulai paling awal) di seluruh tugas.
  // ES/EF berupa indeks hari kerja absolut (bisa dimulai dari 0 atau dari batasan tanggal),
  // sehingga harus diambil selisihnya. Baseline ini sama dengan yang dipakai backward pass
  // (LF node tanpa successor = max EF), supaya float yang ditampilkan konsisten dengan durasi.
  let projectDurationWorkDays: number | null = null;
  {
    let maxFinish = -Infinity;
    let minStart = Infinity;
    for (const s of allForward.values()) {
      if (s.earliestFinishWorkDay > maxFinish) maxFinish = s.earliestFinishWorkDay;
      if (s.earliestStartWorkDay < minStart) minStart = s.earliestStartWorkDay;
    }
    projectDurationWorkDays =
      maxFinish === -Infinity || minStart === Infinity ? null : maxFinish - minStart;
  }

  // Critical path: path dengan float 0 dalam komponen utama.
  // Kita cari semua critical path di komponen utama menggunakan DP rekursif.
  const criticalPaths = primaryComponentId !== undefined
    ? findAllCriticalPaths(primaryTasks(tasks, componentIdByNode, primaryComponentId), graph.edges.filter(
        (e) => componentIdByNode.get(e.from) === primaryComponentId && componentIdByNode.get(e.to) === primaryComponentId
      ), allForward, allBackward, calendar)
    : [];

  // criticalTaskIds = union dari semua criticalPaths (dan isolated yang float 0? tidak,
  // isolated float = durasi, jadi tidak kritis kecuali durasi 0).
  const criticalTaskIdsSet = new Set<string>();
  for (const path of criticalPaths) {
    for (const id of path) criticalTaskIdsSet.add(id);
  }
  // Tambahan: tugas isolated dengan durasi 0 (milestone tanpa hubungan) tidak masuk critical
  // karena float-nya = durasi = 0 tapi bukan bagian dari jaringan utama.
  // Kita beri definisi: critical = float 0 DAN berada di komponen utama.
  const criticalTaskIds: string[] = [];
  for (const t of tasks) {
    const sched = allForward.get(t.id);
    const backward = allBackward.get(t.id);
    const float =
      sched && backward ? backward.latestStartWorkDay - sched.earliestStartWorkDay : null;
    const inPrimary = primaryComponentId !== undefined && componentIdByNode.get(t.id) === primaryComponentId;
    if (inPrimary && float !== null && Math.abs(float) <= EPS) {
      criticalTaskIdsSet.add(t.id);
    }
  }
  for (const id of criticalTaskIdsSet) criticalTaskIds.push(id);

  // Build output tugas
  const resultTasks: CpmTaskResult[] = tasks.map((t) => {
    const sched = allForward.get(t.id);
    const backward = allBackward.get(t.id);
    const float =
      sched && backward ? backward.latestStartWorkDay - sched.earliestStartWorkDay : null;
    const inPrimary =
      primaryComponentId !== undefined && componentIdByNode.get(t.id) === primaryComponentId;
    const isCritical = inPrimary && float !== null && Math.abs(float) <= EPS;
    const predecessors = graph.edges.filter((e) => e.to === t.id).map((e) => e.from);
    const successors = graph.edges.filter((e) => e.from === t.id).map((e) => e.to);
    return {
      id: t.id,
      title: t.title,
      durationWorkDays: t.durationWorkDays,
      isMilestone: t.isMilestone,
      earliestStartWorkDay: sched?.earliestStartWorkDay ?? null,
      earliestFinishWorkDay: sched?.earliestFinishWorkDay ?? null,
      latestStartWorkDay: backward?.latestStartWorkDay ?? null,
      latestFinishWorkDay: backward?.latestFinishWorkDay ?? null,
      floatWorkDays: float,
      isCritical,
      predecessors,
      successors,
    };
  });

  return {
    tasks: resultTasks,
    projectDurationWorkDays,
    criticalTaskIds: criticalTaskIds,
    criticalPaths,
    isolatedTaskIds,
    errors,
  };
}

function primaryTasks(tasks: TaskNode[], componentIdByNode: Map<string, number>, compId: number): TaskNode[] {
  return tasks.filter((t) => componentIdByNode.get(t.id) === compId);
}

export interface ForwardResult {
  earliestStartWorkDay: number;
  earliestFinishWorkDay: number;
}

/**
 * Forward pass untuk kumpulan tugas dengan edges yang diberikan.
 * Menghasilkan ES dan EF dalam indeks work-day.
 *
 * Aturan batas awal:
 * - Jika tugas memiliki startDate yang diberikan, ES minimal = workdayIndex(startDate).
 * - Jika tidak, ES = 0 (indeks dasar).
 *
 * Forward pass menghitung ES/EF berdasarkan predecessor.
 */
export function forwardPass(
  tasks: TaskNode[],
  edges: Dependency[],
  calendar?: CalendarWorkdays
): Map<string, ForwardResult> {
  const nodes = new Map<string, TaskNode>();
  for (const t of tasks) nodes.set(t.id, t);

  // inbound edges per node
  const successors = new Map<string, string[]>();
  const preds = new Map<string, Dependency[]>();
  for (const id of nodes.keys()) {
    successors.set(id, []);
    preds.set(id, []);
  }
  for (const e of edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    successors.get(e.from)!.push(e.to);
    preds.get(e.to)!.push(e);
  }

  // Gabungan predecesor untuk traversal linear: kita ingin urutan topologis.
  // Karena sudah dicek siklus, kita lakukan Kahn's untuk mendapatkan urutan.
  const indeg = new Map<string, number>();
  for (const id of nodes.keys()) indeg.set(id, 0);
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) {
      indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indeg.entries()) {
    if (deg === 0) queue.push(id);
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // Set ES awal berdasarkan startDate jika ada
  for (const t of tasks) {
    let start = 0;
    if (t.startDate) {
      const d = new Date(t.startDate);
      if (!isNaN(d.getTime())) {
        start = Math.max(0, workdayIndex(d, calendar));
      }
    }
    es.set(t.id, start);
    const dur = Math.max(0, t.durationWorkDays);
    ef.set(t.id, start + dur);
  }

  // Proses Kahn (queue dipakai langsung agar node yang baru siap ikut diproses)
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curEs = es.get(cur) ?? 0;
    const curEf = ef.get(cur) ?? curEs;
    const succList = successors.get(cur) ?? [];
    for (const succId of succList) {
      const depList = preds.get(succId) ?? [];
      // Cari dependensi dari cur ke succId
      const dep = depList.find((d) => d.from === cur);
      if (!dep) continue;
      let candidate = curEf + dep.lagWorkDays; // FS: EF_pred + lag
      if (dep.type === 'SS') {
        candidate = (es.get(cur) ?? 0) + dep.lagWorkDays; // SS: ES_pred + lag
      }
      const curSuccEs = es.get(succId) ?? 0;
      if (candidate > curSuccEs) {
        es.set(succId, candidate);
        const dur = Math.max(0, nodes.get(succId)?.durationWorkDays ?? 0);
        ef.set(succId, candidate + dur);
      }
    }

    // Propin queue berikutnya (Kahn)
    for (const succId of (successors.get(cur) ?? [])) {
      const deg = indeg.get(succId) ?? 0;
      if (deg === 1) {
        indeg.set(succId, 0);
        queue.push(succId);
      } else {
        indeg.set(succId, deg - 1);
      }
    }
  }

  const result = new Map<string, ForwardResult>();
  for (const id of nodes.keys()) {
    result.set(id, {
      earliestStartWorkDay: es.get(id) ?? 0,
      earliestFinishWorkDay: ef.get(id) ?? 0,
    });
  }
  return result;
}

export interface BackwardResult {
  latestStartWorkDay: number;
  latestFinishWorkDay: number;
}

/**
 * Backward pass. LF node sink = project duration (maks EF di komponen ini),
 * atau berdasarkan constraint endDate jika ada.
 *
 * Untuk komponen yang di-passing, kita terlebih dahulu hitung project duration sebagai
 * max EF dari forward pass. Kemudian reverse topological order untuk backward pass.
 */
export function backwardPass(
  tasks: TaskNode[],
  edges: Dependency[],
  forward: Map<string, ForwardResult>,
  calendar?: CalendarWorkdays
): Map<string, BackwardResult> {
  const nodes = new Map<string, TaskNode>();
  for (const t of tasks) nodes.set(t.id, t);

  // successors / predecessors
  const succEdges = new Map<string, Dependency[]>();
  const predEdges = new Map<string, Dependency[]>();
  for (const id of nodes.keys()) {
    succEdges.set(id, []);
    predEdges.set(id, []);
  }
  for (const e of edges) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
    succEdges.get(e.from)!.push(e);
    predEdges.get(e.to)!.push(e);
  }

  // project duration = max EF
  let projectDuration = 0;
  for (const s of forward.values()) {
    if (s.earliestFinishWorkDay > projectDuration) projectDuration = s.earliestFinishWorkDay;
  }

  // LF awal: jika ada endDate constraint, gunakan itu (konversi ke workday), kalau tidak
  // untuk sink gunakan projectDuration, untuk node lain kita fill nanti lewat backward pass.
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const t of tasks) {
    let endConstraint = projectDuration;
    if (t.endDate) {
      const d = new Date(t.endDate);
      if (!isNaN(d.getTime())) {
        endConstraint = Math.min(endConstraint, workdayIndex(d, calendar) + 1);
      }
    }
    lf.set(t.id, endConstraint);
    const dur = Math.max(0, t.durationWorkDays);
    ls.set(t.id, endConstraint - dur);
  }

  // Reverse topological order: nodes dengan no successors dulu (sink).
  const outdeg = new Map<string, number>();
  for (const id of nodes.keys()) outdeg.set(id, 0);
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) {
      outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of outdeg.entries()) {
    if (deg === 0) queue.push(id);
  }

  // Proses Kahn terbalik (queue dipakai langsung agar predecessor yang baru siap diproses)
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLf = lf.get(cur) ?? projectDuration;
    const curLs = ls.get(cur) ?? curLf;
    const predList = predEdges.get(cur) ?? [];
    for (const dep of predList) {
      const predId = dep.from;
      let candidate = curLs - dep.lagWorkDays; // FS: LS_succ - lag
      if (dep.type === 'SS') {
        // Untuk SS, predecessor LF = LS_succ - lag? aturan umum:
        // SS backward: LF_pred = LS_succ - lag, karena successor start >= pred start + lag.
        candidate = curLs - dep.lagWorkDays;
      }
      const curPredLf = lf.get(predId) ?? projectDuration;
      if (candidate < curPredLf) {
        lf.set(predId, candidate);
        const dur = Math.max(0, nodes.get(predId)?.durationWorkDays ?? 0);
        ls.set(predId, candidate - dur);
      }
    }

    // Propagate queue (reverse Kahn)
    for (const dep of predEdges.get(cur) ?? []) {
      const fromId = dep.from;
      const deg = outdeg.get(fromId) ?? 0;
      if (deg === 1) {
        outdeg.set(fromId, 0);
        queue.push(fromId);
      } else {
        outdeg.set(fromId, deg - 1);
      }
    }
  }

  const result = new Map<string, BackwardResult>();
  for (const id of nodes.keys()) {
    result.set(id, {
      latestStartWorkDay: ls.get(id) ?? projectDuration,
      latestFinishWorkDay: lf.get(id) ?? projectDuration,
    });
  }
  return result;
}

/**
 * Temukan semua critical path di komponen utama dengan DP rekursif maksimal.
 * Kita definisikan critical path sebagai path dari source (no pred) ke sink (no succ)
 * di mana semua node memiliki float 0.
 *
 * Jika ada beberapa jalur dengan panjang sama dan semua node float 0, semua dianggap critical.
 */
export function findAllCriticalPaths(
  tasks: TaskNode[],
  edges: Dependency[],
  forward: Map<string, ForwardResult>,
  backward: Map<string, BackwardResult>,
  calendar?: CalendarWorkdays
): string[][] {
  const nodes = new Map<string, TaskNode>();
  for (const t of tasks) nodes.set(t.id, t);

  const succ = new Map<string, string[]>();
  for (const id of nodes.keys()) succ.set(id, []);
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) {
      succ.get(e.from)!.push(e.to);
    }
  }

  const preds = new Map<string, string[]>();
  for (const id of nodes.keys()) preds.set(id, []);
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) {
      preds.get(e.to)!.push(e.from);
    }
  }

  // Critical node = float 0
  const criticalNode = new Set<string>();
  for (const t of tasks) {
    const fwd = forward.get(t.id);
    const bwd = backward.get(t.id);
    if (fwd && bwd) {
      const float = bwd.latestStartWorkDay - fwd.earliestStartWorkDay;
      if (Math.abs(float) <= EPS) {
        criticalNode.add(t.id);
      }
    }
  }

  // Source nodes: critical nodes dengan tidak ada predecesor di komponen ini
  const sources = tasks.filter(
    (t) => criticalNode.has(t.id) && (preds.get(t.id)?.length ?? 0) === 0
  ).map((t) => t.id);

  // Sink nodes: critical nodes tanpa successor di komponen ini
  const sinks = tasks.filter(
    (t) => criticalNode.has(t.id) && (succ.get(t.id)?.length ?? 0) === 0
  ).map((t) => t.id);

  // DP rekursif untuk menghitung panjang maksimal dari node ke sink
  const longestMemo = new Map<string, number>();
  function longestFrom(id: string): number {
    if (longestMemo.has(id)) return longestMemo.get(id)!;
    const s = succ.get(id) ?? [];
    let maxLen = 1; // termasuk dirinya
    for (const nextId of s) {
      if (!criticalNode.has(nextId)) continue;
      const childLen = longestFrom(nextId);
      if (childLen + 1 > maxLen) maxLen = childLen + 1;
    }
    longestMemo.set(id, maxLen);
    return maxLen;
  }

  // Hitung panjang maksimal dari setiap source ke sinks
  const sourceLongest = new Map<string, number>();
  for (const srcId of sources) {
    sourceLongest.set(srcId, longestFrom(srcId));
  }
  const maxCriticalPathLength = Math.max(0, ...Array.from(sourceLongest.values()));

  // Rekonstruksi semua critical path dari setiap source dengan panjang == maxCriticalPathLength
  const allPaths: string[][] = [];
  function reconstructPaths(currentId: string, path: string[]): void {
    const s = succ.get(currentId) ?? [];
    if (s.length === 0) {
      // sink
      if (path.length === maxCriticalPathLength) {
        allPaths.push([...path]);
      }
      return;
    }
    for (const nextId of s) {
      if (!criticalNode.has(nextId)) continue;
      // apakah nextId termasuk dalam jalur panjang maksimal?
      const nextLen = longestFrom(nextId);
      if (path.length + nextLen === maxCriticalPathLength) {
        reconstructPaths(nextId, [...path, nextId]);
      }
    }
  }

  for (const srcId of sources) {
    if (sourceLongest.get(srcId) === maxCriticalPathLength) {
      reconstructPaths(srcId, [srcId]);
    }
  }

  // Jika tidak ada jalur yang terbentuk (mis. hanya satu node critical dan itu source & sink),
  // pastikan path tunggal masuk.
  if (maxCriticalPathLength === 1 && sources.length > 0 && sinks.length > 0) {
    // Situasi: satu node yang source sekaligus sink (tidak ada edge), tapi critical.
    // Ini seharusnya dianggap sebagai critical path tunggal.
    for (const srcId of sources) {
      if (sinks.includes(srcId)) {
        allPaths.push([srcId]);
      }
    }
  }

  return allPaths;
}

/**
 * Helper: urutan topologi (linear) untuk node dalam graph.
 * Digunakan untuk render & validasi tambahan.
 */
export function topologicalOrder(
  tasks: TaskNode[],
  edges: Dependency[]
): string[] {
  const nodes = new Map<string, TaskNode>();
  for (const t of tasks) nodes.set(t.id, t);
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodes.keys()) {
    adj.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) {
      adj.get(e.from)!.push(e.to);
      indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of indeg.entries()) {
    if (deg === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const nextId of adj.get(cur) ?? []) {
      const deg = indeg.get(nextId) ?? 0;
      if (deg === 1) {
        indeg.set(nextId, 0);
        queue.push(nextId);
      } else {
        indeg.set(nextId, deg - 1);
      }
    }
  }
  return order;
}

// ============================================================================
// KONVERSI FUNGSI TANGGAL ⇔ INDEX KERJA
// ============================================================================

/**
 * Dari indeks work-day absolut, dapatkan tanggal fisik.
 */
export function dateFromWorkdayIndex(workdayIndex: number, calendar?: CalendarWorkdays): Date {
  const epoch = new Date(1970, 0, 1);
  const d = new Date(epoch);
  let count = 0;
  while (count < workdayIndex) {
    d.setDate(d.getDate() + 1);
    if (isWorkday(d.getDay(), calendar)) {
      count++;
    }
  }
  return d;
}

/**
 * Hitung tanggal mulai fisik dari earliestStartWorkDay (indeks absolut) dengan
 * menyesuaikan constraint startDate jika node punya startDate.
 */
export function earliestStartTime(
  earliestStartWorkDay: number,
  startDate?: string | null,
  calendar?: CalendarWorkdays
): Date {
  if (startDate) {
    const d = new Date(startDate);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return dateFromWorkdayIndex(earliestStartWorkDay, calendar);
}

/**
 * Hitung tanggal selesai fisik dari earliestFinishWorkDay indeks absolut.
 * Tanggal selesai = workday setelah earliestFinishWorkDay - 1?
 * Kita definisikan: finish work-day index adalah hari kerja terakhir yang menyelesaikan tugas.
 * Jadi tanggal fisik selesai = dateFromWorkdayIndex(earliestFinishWorkDay).
 */
export function earliestFinishTime(
  earliestFinishWorkDay: number,
  endDate?: string | null,
  calendar?: CalendarWorkdays
): Date {
  if (endDate) {
    const d = new Date(endDate);
    if (!isNaN(d.getTime())) return d;
  }
  return dateFromWorkdayIndex(earliestFinishWorkDay, calendar);
}

// ============================================================================
// CONTOH & TEST MANUAL
// ============================================================================

/**
 * Contoh jadwal sederhana yang bisa dihitung manual:
 *
 * Tugas A (durasi 3 hari kerja): ES=0, EF=3
 * Tugas B (durasi 2 hari kerja): dependensi FS dari A dengan lag 1,
 *   → ES = EF_A + lag = 3 + 1 = 4, EF = 4 + 2 = 6
 *   Backward: LF_B = projectDuration = 6, LS_B = LF_B - dur = 6 - 2 = 4, float B = 0
 *   LF_A = LS_B - lag = 4 - 1 = 3, LS_A = 3 - 3 = 0, float A = 0
 *   Critical path: A → B, durasi proyek = 6 work-day.
 *
 * Tugas C (durasi 1, independen): ES=0 EF=1. Tidak terhubung → isolated.
 *   Float = durasi = 1, bukan bagian jaringan utama.
 *
 * Tugas D (milestone durasi 0) sebagai sink di jalur utama:
 *   A(3) → D(0) FS lag 0 : ES_D = EF_A = 3, EF_D = 3.
 *   backward: LF_D = projectDuration = 3, LS_D = 3. Float D = 0.
 *   LF_A = LS_D - 0 = 3, LS_A = 3 - 3 = 0, float A = 0.
 *   Critical: A & D.
 *
 * Tugas dengan SS: X durasi 2, Y durasi 2
 *   SS X→Y lag 0: ES_Y = ES_X + 0 = 0, EF_Y = 2.
 *   FS X→Y? tidak ada, jadi EF_Y = 0+2=2.
 *   projectDuration = max(EF_X=2, EF_Y=2) = 2.
 *   backward: LF_X = 2, LS_X = 0; LF_Y = 2, LS_Y=0; float masing-masing 0 → critical keduanya.
 *
 * Float menghitung LS-ES. Jika node independent ES=0, projectDuration=2,
 * backward LF node independen = 2 (karena kita set LF awal = projectDuration untuk semua node),
 * ls = 2 - dur.
 *
 * Catatan: backward pass di implementasi ini menetapkan LF awal = projectDuration untuk
 * SEMUA node, lalu disebar balik. Itu artinya node independent C (durasi1)
 * akan punya LS = 2-1 = 1, LF=2, ES=0 → float = 1 (bukan 0) → tidak kritis.
 * Itu konsisten: node isolated memang bukan bottleneck.
 *
 * PENJELASAN TENTANG TUGAS ISOLATED:
 * - Tugas yang tidak terhubung (degree 0) dihitung ES/EF/LS/LF secara independen
 *   menggunakan forwardPass (akan punya ES/EF) dan backwardPass (LF awal = projectDuration
 *   whole graph, lalu backward pass tidak mengubah karena tidak ada edge).
 * - Namun project duration utama ditentukan dari komponen utama, jadi tugas isolated
 *   TIDAK menentukan project duration utama.
 * - Float isolated = LS - ES; untuk node isolated dengan durasi>0 akan punya float >0
 *   kecuali projectDuration overall = 0. Jika projectDuration = 0 (tidak ada tugas),
 *   float isolated = 0 tapi kita tandai isolatedTaskIds dan tidak ikut criticalTaskIds
 *   kecuali dinyatakan secara eksplisit.
 *
 * KETERBATASAN DOKUMENTASI:
 * - Jika terdapat komponen>1 yang masing-masing punya edge (graf terdisconnect dengan
 *   multi-component berisi edge), implementasi ini memilih SATU "komponen utama"
 *   berdasarkan yang memiliki durasi forward pass terbesar untuk menentukan projectDuration
 *   dan criticalPath utama. Komponen lain dianggap "secondary" dan tidak masuk critical path
 *   utama; tugas di komponen secondary tetap dapat float 0 dan ditampilkan sebagai
 *   "critical di komponen masing-masing" secara opsional. Implementasi saat ini TIDAK
 *   menarik critical path kedua secara default kecuali saya extend nanti.
 * - Jika diinginkan critical path untuk tiap komponen, extend fungsi ini.
 */

/**
 * Hitung ringkasan jadwal tugas dari hasil CPM untuk digunakan di Gantt & PERT.
 */
export interface ComputedTaskSchedule {
  taskId: string;
  title: string;
  isMilestone: boolean;
  durationWorkDays: number;
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
  earliestStart: Date | null;
  earliestFinish: Date | null;
  latestStart: Date | null;
  latestFinish: Date | null;
}

export function toComputedSchedule(
  cpm: CpmResult,
  calendar?: CalendarWorkdays
): ComputedTaskSchedule[] {
  return cpm.tasks.map((t) => {
    const earliestStart = t.earliestStartWorkDay !== null
      ? earliestStartTime(t.earliestStartWorkDay, t.startDateConstraint ?? null, calendar)
      : null;
    const earliestFinish = t.earliestFinishWorkDay !== null
      ? earliestFinishTime(t.earliestFinishWorkDay, t.endDateConstraint ?? null, calendar)
      : null;
    const latestStart = t.latestStartWorkDay !== null
      ? dateFromWorkdayIndex(t.latestStartWorkDay, calendar)
      : null;
    const latestFinish = t.latestFinishWorkDay !== null
      ? dateFromWorkdayIndex(t.latestFinishWorkDay, calendar)
      : null;
    return {
      taskId: t.id,
      title: t.title,
      isMilestone: t.isMilestone,
      durationWorkDays: t.durationWorkDays,
      earliestStartWorkDay: t.earliestStartWorkDay,
      earliestFinishWorkDay: t.earliestFinishWorkDay,
      latestStartWorkDay: t.latestStartWorkDay,
      latestFinishWorkDay: t.latestFinishWorkDay,
      floatWorkDays: t.floatWorkDays,
      isCritical: t.isCritical,
      startDateConstraint: t.startDateConstraint ?? null,
      endDateConstraint: t.endDateConstraint ?? null,
      predecessors: t.predecessors,
      successors: t.successors,
      earliestStart,
      earliestFinish,
      latestStart,
      latestFinish,
    };
  });
}
