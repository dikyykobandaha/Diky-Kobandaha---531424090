import { ReactNode } from 'react';

interface FormErrorProps {
  children?: ReactNode;
  error: string | string[] | undefined | null;
}

export default function FormError({ error, children }: FormErrorProps) {
  if (!error || (Array.isArray(error) && error.length === 0)) return null;

  const messages = Array.isArray(error) ? error : [error];
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div>
          {children}
          {messages.length === 1 ? (
            <span className="block">{messages[0]}</span>
          ) : (
            <ul className="mt-1 space-y-1">
              {messages.map((msg, i) => (
                <li key={i} className="list-disc pl-4">{msg}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
