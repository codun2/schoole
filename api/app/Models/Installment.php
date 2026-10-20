<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Installment extends TenantModel
{
    protected $casts = ['due_date' => 'date:Y-m-d', 'amount' => 'decimal:3', 'paid' => 'decimal:3'];
    protected $appends = ['remaining', 'is_overdue'];
    public function contract(): BelongsTo { return $this->belongsTo(Contract::class); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function getRemainingAttribute(): string { return number_format(max(0, (float) $this->amount - (float) $this->paid), 3, '.', ''); }
    public function getIsOverdueAttribute(): bool { return $this->status !== 'paid' && $this->due_date && $this->due_date->isPast() && ! $this->due_date->isToday(); }
}
