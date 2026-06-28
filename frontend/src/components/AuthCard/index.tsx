import { type ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { cn } from '@/shadcn/lib/utils';

export function AuthCard({
  children,
  description,
  footer,
  footerClassName,
  maxWidth = 'md',
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  footer?: ReactNode;
  footerClassName?: string;
  maxWidth?: '2xl' | 'md';
  title: ReactNode;
}) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className={cn('w-full', maxWidth === '2xl' ? 'max-w-2xl' : 'max-w-md')}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? <CardFooter className={footerClassName}>{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}
