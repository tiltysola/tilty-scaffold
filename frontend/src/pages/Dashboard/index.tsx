import { getStoredSession } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';

const Index = () => {
  const session = getStoredSession();
  const username = session?.user.username ?? 'User';

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Session status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div>
            Signed-in account: <span className="font-medium">{username}</span>
          </div>
          <p className="text-muted-foreground">The current session is authenticated.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
