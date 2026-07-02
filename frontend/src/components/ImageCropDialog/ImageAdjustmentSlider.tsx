import { Label } from '@/shadcn/components/ui/label';
import { Slider } from '@/shadcn/components/ui/slider';

interface ImageAdjustmentSliderProps {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onValueChange: (value: number[]) => void;
  step?: number;
  suffix: string;
  value: number;
}

export function ImageAdjustmentSlider({
  disabled,
  label,
  max,
  min,
  onValueChange,
  step = 1,
  suffix,
  value,
}: ImageAdjustmentSliderProps) {
  const id = `image${label.replaceAll(' ', '')}`;
  const displayValue = step < 1 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {displayValue}
          {suffix}
        </span>
      </div>
      <Slider
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onValueChange={onValueChange}
        step={step}
        value={[value]}
      />
    </div>
  );
}
