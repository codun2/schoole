<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashAccount extends TenantModel
{
    protected $casts = ['opening_balance' => 'decimal:3', 'is_active' => 'boolean'];
    public function vouchers(): HasMany { return $this->hasMany(Voucher::class); }
}
