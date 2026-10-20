<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeAdvance extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d', 'amount' => 'decimal:3', 'monthly_deduction' => 'decimal:3', 'remaining' => 'decimal:3'];
    public function employee(): BelongsTo { return $this->belongsTo(Employee::class); }
}
