import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getUserHandle } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';

const Index = () => {
  const { user } = useAuthenticatedSession();
  const displayName = user.displayName;
  const username = getUserHandle(user.username);

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back, {displayName}</CardTitle>
          <CardDescription>{username}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Tilty Scaffold is a full-stack application scaffold with authentication, routing, profile management,
            role-based access, and OpenAPI documentation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
