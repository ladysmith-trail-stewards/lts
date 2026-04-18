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
  fallbackPlaceholder?: string;
}

/**
 * Renders a single <tr> row for the Feature Mapper table.
 * Must be placed inside a <tbody>.
 */
export default function GeneralGeomMapperSection({
  label,
  fields,
  fieldValue,
  fallbackValue,
  onFieldChange,
  onFallbackChange,
  disabled,
  fallbackPlaceholder = 'Fallback',
}: GeneralGeomMapperSectionProps) {
  return (
    <tr>
      {/* Target parameter */}
      <td className="py-1.5 pr-3 text-sm font-medium whitespace-nowrap align-middle w-24">
        {label}
      </td>

      {/* Input parameter dropdown */}
      <td className="py-1.5 pr-2 align-middle">
        <Select
          value={fieldValue || '__none__'}
          onValueChange={(value) =>
            onFieldChange(value == null || value === '__none__' ? '' : value)
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-sm">
            {fieldValue ? (
              <SelectValue />
            ) : (
              <span className="text-muted-foreground truncate">
                Select {label} from input
              </span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="italic text-muted-foreground">
                None (use fallback)
              </span>
            </SelectItem>
            {fields.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Fallback value */}
      <td className="py-1.5 align-middle">
        <Input
          value={fallbackValue}
          onChange={(e) => onFallbackChange(e.target.value)}
          disabled={disabled}
          placeholder={fallbackPlaceholder}
          className="h-8 text-sm"
        />
      </td>
    </tr>
  );
}
