import { useIntl } from 'react-intl';

import { Button } from '@/shadcn/components/ui/button';
import { TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

import { HoverScrollArea } from '@/components/HoverScrollArea';
import { type SetupStepDefinition } from '@/components/SetupConfiguration/definitions';
import { formatSetupStepTitle } from '@/components/SetupConfiguration/utils';

type SettingsStepNavStep = Pick<SetupStepDefinition, 'icon' | 'id'>;

export function SettingsStepNav({
  activeStepId,
  onChange,
  steps,
}: {
  activeStepId?: string;
  onChange: (stepId: string) => void;
  steps: SettingsStepNavStep[];
}) {
  const intl = useIntl();

  return (
    <>
      <div aria-label={intl.formatMessage({ id: 'system.settings.sections' })} className="min-w-0 lg:hidden">
        <div className="-mx-4 px-4">
          <HoverScrollArea className="w-full">
            <TabsList className="w-max min-w-full justify-start">
              {steps.map((step) => (
                <TabsTrigger className="shrink-0 px-2.5" key={step.id} value={step.id}>
                  {formatSetupStepTitle(step, intl)}
                </TabsTrigger>
              ))}
            </TabsList>
          </HoverScrollArea>
        </div>
      </div>
      <nav
        aria-label={intl.formatMessage({ id: 'system.settings.sections' })}
        className="hidden h-fit gap-1 lg:sticky lg:top-18 lg:grid"
      >
        {steps.map((step) => {
          const StepIcon = step.icon;
          const isActive = step.id === activeStepId;

          return (
            <Button
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'h-10 w-full min-w-0 justify-start gap-2 rounded-md px-3 text-left',
                isActive
                  ? 'bg-sidebar-accent/45 text-sidebar-accent-foreground ring-1 ring-border/30 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/25 hover:text-sidebar-accent-foreground',
              )}
              key={step.id}
              onClick={() => onChange(step.id)}
              type="button"
              variant="ghost"
            >
              <StepIcon className="size-4 shrink-0" />
              <span className="truncate">{formatSetupStepTitle(step, intl)}</span>
            </Button>
          );
        })}
      </nav>
    </>
  );
}
