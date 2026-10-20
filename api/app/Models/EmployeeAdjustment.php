<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeAdjustment extends TenantModel
{
    protected $casts = ['amount' => 'decimal:3'];
    public function employee(): BelongsTo { return $this->belongsTo(Employee::class); }
}
