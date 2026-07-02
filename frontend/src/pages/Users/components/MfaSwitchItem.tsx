import { type ReactNode } from 'react';

import { Badge } from '@/shadcn/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/shadcn/components/ui/item';
import { Switch } from '@/shadcn/components/ui/switch';

interface MfaSwitchItemProps {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  status: string;
  title: string;
}

export function MfaSwitchItem({
  checked,
  description,
  disabled,
  icon,
  onCheckedChange,
  status,
  title,
}: MfaSwitchItemProps) {
  return (
    <Item>
      <ItemMedia>{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          {title}
          <Badge variant={checked ? 'secondary' : 'outline'}>{status}</Badge>
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      </ItemActions>
    </Item>
  );
}
