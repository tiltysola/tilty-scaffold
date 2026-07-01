import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { FileQuestionIcon, HomeIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

import { AppEmptyState } from '@/components/AppEmptyState';

const Index = () => {
  const intl = useIntl();

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background px-4 py-10 text-foreground">
      <AppEmptyState
        actions={
          <Button asChild>
            <Link to="/">
              <HomeIcon />
              {intl.formatMessage({ id: 'not.found.return.home' })}
            </Link>
          </Button>
        }
        actionsClassName="flex-row justify-center gap-2"
        description={intl.formatMessage({ id: 'not.found.description' })}
        icon={<FileQuestionIcon />}
        title={intl.formatMessage({ id: 'not.found.title' })}
      />
    </main>
  );
};

export default Index;
