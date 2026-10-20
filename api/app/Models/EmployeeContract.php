<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeContract extends TenantModel
{
    protected $casts = ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'basic_salary' => 'decimal:3', 'allowances' => 'decimal:3'];

    protected $appends = ['state'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** valid | expiring (≤30d) | expired — mirrors License. */
    public function getStateAttribute(): string
    {
        if ($this->status === 'terminated') return 'terminated';
        if (! $this->end_date) return 'valid';
        if ($this->end_date->isPast()) return 'expired';
        return $this->end_date->diffInDays(now()) <= 30 ? 'expiring' : 'valid';
    }
}
