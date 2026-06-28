import { CheckCircle2Icon, CommandIcon } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shadcn/components/ui/sidebar';
import { cn } from '@/shadcn/lib/utils';

import { setupSteps } from '@/components/SetupConfiguration/definitions';

export function SetupSidebar({
  activeStep,
  maxUnlockedStepIndex,
  onNavigate,
}: {
  activeStep: string;
  maxUnlockedStepIndex: number;
  onNavigate: (stepId: string, stepIndex: number) => void;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar className="border-r" collapsible="offcanvas" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <CommandIcon />
              <span className="text-base font-semibold">Tilty Scaffold</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="grid gap-0.5 px-2 pt-2">
          <h2 className="text-sm font-medium">Setup</h2>
          <p className="text-xs text-muted-foreground">Initial system configuration</p>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarMenu>
          {setupSteps.map((step, stepIndex) => {
            const StepIcon = step.icon;
            const locked = stepIndex > maxUnlockedStepIndex;
            const completedStep = stepIndex < maxUnlockedStepIndex;
            const isActive = activeStep === step.id;

            return (
              <SidebarMenuItem key={step.id}>
                <SidebarMenuButton
                  aria-current={isActive ? 'step' : undefined}
                  className={cn('h-10', locked ? 'cursor-not-allowed text-muted-foreground/50' : undefined)}
                  disabled={locked}
                  isActive={isActive}
                  onClick={() => {
                    if (locked) {
                      return;
                    }

                    onNavigate(step.id, stepIndex);
                    setOpenMobile(false);
                  }}
                  type="button"
                >
                  {completedStep ? <CheckCircle2Icon className="text-primary" /> : <StepIcon />}
                  <span>{step.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
