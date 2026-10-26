<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Employee;
use App\Models\Guardian;
use Closure;
use Illuminate\Database\Eloquent\Model;

/**
 * Email identifies a person across the school: the same address must not be reused by
 * another guardian or employee. Both models are company-scoped, so the check stays within
 * the current school. Comparison is case-insensitive.
 */
trait UniqueContactEmail
{
    /** $self is 'guardian' or 'employee' — the record being saved is excluded from its own table. */
    protected function uniqueEmailRule(?Model $record, string $self): Closure
    {
        return function ($attr, $value, $fail) use ($record, $self) {
            $email = mb_strtolower(trim((string) $value));
            if ($email === '') {
                return;
            }
            $usedByGuardian = Guardian::whereRaw('LOWER(email) = ?', [$email])
                ->when($self === 'guardian' && $record, fn ($q) => $q->where('id', '!=', $record->id))
                ->exists();
            $usedByEmployee = Employee::whereRaw('LOWER(email) = ?', [$email])
                ->when($self === 'employee' && $record, fn ($q) => $q->where('id', '!=', $record->id))
                ->exists();
            if ($usedByGuardian || $usedByEmployee) {
                $fail('هذا البريد الإلكتروني مستخدم مسبقاً لحساب آخر في النظام (معلّم أو ولي أمر). استخدم بريداً مختلفاً.');
            }
        };
    }
}
