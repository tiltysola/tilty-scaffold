import { getStoredSession } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';

const DashboardPage = () => {
  const session = getStoredSession();
  const username = session?.user.username ?? 'User';

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Protected login status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div>
            Logged-in account: <span className="font-medium">{username}</span>
          </div>
          <p className="text-muted-foreground">This page confirms a successful login for the scaffold application.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
