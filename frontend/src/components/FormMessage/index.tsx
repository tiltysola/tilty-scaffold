import { Alert, AlertDescription } from '@/shadcn/components/ui/alert';
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

  return (
    <Alert
      className={cn('px-3 py-2', formMessageClassNames[variant])}
      variant={variant === 'error' ? 'destructive' : 'default'}
    >
      <AlertDescription className="text-current">{message}</AlertDescription>
    </Alert>
  );
};

export default Index;
