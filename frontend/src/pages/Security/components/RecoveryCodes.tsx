import { CopyIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { DialogClose, DialogFooter } from '@/shadcn/components/ui/dialog';

export function RecoveryCodes({ codes, onCopy }: { codes: string[]; onCopy: () => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <code className="rounded-md bg-muted px-3 py-2 text-center text-sm" key={code}>
            {code}
          </code>
        ))}
      </div>
      <DialogFooter>
        <Button onClick={onCopy} type="button" variant="outline">
          <CopyIcon />
          Copy codes
        </Button>
        <DialogClose asChild>
          <Button type="button">Done</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
