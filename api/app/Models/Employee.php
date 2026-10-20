<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends TenantModel
{
    protected $casts = ['birth_date' => 'date:Y-m-d', 'hire_date' => 'date:Y-m-d', 'is_teacher' => 'boolean', 'basic_salary' => 'decimal:3', 'housing_allowance' => 'decimal:3', 'transport_allowance' => 'decimal:3', 'other_allowance' => 'decimal:3'];
    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function jobTitle(): BelongsTo { return $this->belongsTo(JobTitle::class); }
    public function allowances(): float { return (float) $this->housing_allowance + (float) $this->transport_allowance + (float) $this->other_allowance; }
}
