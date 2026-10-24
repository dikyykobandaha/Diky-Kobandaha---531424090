import axios from 'axios';

function getBaseUrl() {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_API_URL ?? window.location.origin;
  }
  // Di development, proxy Vite menghandle request ke backend
  return ''; // Tanpa baseURL, request dikirim relatif ke proxy
}

export const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Tambahkan interceptor untuk menambah CSRF token ke header
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Coba dapatkan dari sessionStorage atau AuthContext
    const csrfToken = sessionStorage.getItem('csrfToken') || 
      (window as any).__EVENTFLOW_CSRF_TOKEN__;
    if (csrfToken && config.headers) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';
    // Hanya redirect bila bukan request auth dan belum berada di halaman auth,
    // agar tidak lohi loop reload yang menghabiskan rate limit.
    // Jika sudah di halaman login/register, jangan redirect lagi (hindari loop).
    if (
      status === 401 &&
      !url.includes('/auth/') &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register'
    ) {
      const origError = error;
      // Jalankan navigator setelah interceptor selesai agar tidak bentrok dengan promise
      setTimeout(() => {
        try {
          window.location.href = '/login';
        } catch {
          // abaikan
        }
      }, 0);
      return Promise.reject(origError);
    }
    return Promise.reject(error);
  }
);

/** Format error respons API menjadi teks yang bisa ditampilkan di UI */
export function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    // Backend mengirim { success, message, data } atau { message }
    if (data && typeof data === 'object') {
      const d = data as { message?: unknown; success?: unknown; errors?: unknown };
      if (typeof d.message === 'string') return d.message;
      if (d.errors && Array.isArray(d.errors)) {
        return d.errors.map((e: unknown) => (typeof e === 'string' ? e : JSON.stringify(e))).join(', ');
      }
    }
    if (error.message) return error.message;
    // Jika gagal koneksi sama sekali
    if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend sudah berjalan.';
    return `Server error (${error.response.status})`;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Terjadi kesalahan tidak terduga.';
}
