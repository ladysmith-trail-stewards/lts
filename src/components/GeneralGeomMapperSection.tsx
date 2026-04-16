import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GeneralGeomMapperSectionProps {
  label: string;
  fields: string[];
  fieldValue: string;
  fallbackValue: string;
  onFieldChange: (value: string) => void;
  onFallbackChange: (value: string) => void;
  disabled: boolean;
}

export default function GeneralGeomMapperSection({
  label,
  fields,
  fieldValue,
  fallbackValue,
  onFieldChange,
  onFallbackChange,
  disabled,
}: GeneralGeomMapperSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={fieldValue}
        onValueChange={(value) => onFieldChange(value ?? '')}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={`${label} field`} />
        </SelectTrigger>
        <SelectContent>
          {fields.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No fields found
            </div>
          )}
          {fields.map((field) => (
            <SelectItem key={field} value={field}>
              {field}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={fallbackValue}
        onChange={(e) => onFallbackChange(e.target.value)}
        disabled={disabled}
        placeholder={`${label} fallback`}
      />
    </div>
  );
}
