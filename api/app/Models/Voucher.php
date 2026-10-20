<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Voucher extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d', 'amount' => 'decimal:3'];
    public function cashAccount(): BelongsTo { return $this->belongsTo(CashAccount::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
