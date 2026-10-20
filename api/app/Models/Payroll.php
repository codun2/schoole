<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payroll extends TenantModel
{
    protected $casts = ['approved_at' => 'datetime', 'paid_at' => 'datetime', 'total_basic' => 'decimal:3', 'total_allowances' => 'decimal:3', 'total_bonuses' => 'decimal:3', 'total_deductions' => 'decimal:3', 'net_total' => 'decimal:3'];
    public function items(): HasMany { return $this->hasMany(PayrollItem::class); }
}
