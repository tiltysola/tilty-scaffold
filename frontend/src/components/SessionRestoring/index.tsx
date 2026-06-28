import { Spinner } from '@/shadcn/components/ui/spinner';

const Index = () => {
  return (
    <main
      aria-busy="true"
      className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <span>Restoring session</span>
      </div>
    </main>
  );
};

export default Index;
