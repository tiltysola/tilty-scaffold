import { cn } from '@/shadcn/lib/utils';

interface FormMessageProps {
  message?: string | null;
  variant: 'error' | 'notice';
}

const formMessageClassNames = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  notice: 'border-primary/30 bg-primary/10 text-primary',
};

const Index = ({ message, variant }: FormMessageProps) => {
  if (!message) {
    return null;
  }

  return <p className={cn('rounded-lg border px-3 py-2 text-sm', formMessageClassNames[variant])}>{message}</p>;
};

export default Index;
