import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getUserHandle } from '@/lib/auth';

const Index = () => {
  const { user } = useAuthenticatedSession();
  const displayName = user.displayName;
  const username = getUserHandle(user.username);

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">Welcome back, {displayName}</h1>
        <p className="text-sm text-muted-foreground">{username}</p>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Tilty Scaffold is a full-stack application scaffold with authentication, routing, profile management, role-based
        access, and OpenAPI documentation.
      </p>
    </div>
  );
};

export default Index;
