import { Link } from 'react-router-dom';

import { FileQuestionIcon, HomeIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';

const Index = () => {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>Page Not Found</EmptyTitle>
          <EmptyDescription>The requested page does not exist or has been moved.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button asChild>
            <Link to="/">
              <HomeIcon />
              Return to Home
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
};

export default Index;
