<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Expense extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d', 'amount' => 'decimal:3', 'tax' => 'decimal:3', 'total' => 'decimal:3', 'paid' => 'decimal:3'];
    public function category(): BelongsTo { return $this->belongsTo(ExpenseCategory::class, 'expense_category_id'); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function payments(): HasMany { return $this->hasMany(Voucher::class, 'source_id')->where('source_type', 'expense')->orderByDesc('id'); }
}
