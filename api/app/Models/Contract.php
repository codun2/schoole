<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Contract extends TenantModel
{
    protected $casts = ['schedule' => 'array', 'date' => 'date:Y-m-d', 'first_due_date' => 'date:Y-m-d', 'subtotal' => 'decimal:3', 'discount_value' => 'decimal:3', 'discount' => 'decimal:3', 'tax' => 'decimal:3', 'total' => 'decimal:3', 'paid' => 'decimal:3', 'remaining' => 'decimal:3', 'tax_rate' => 'decimal:2'];
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function guardian(): BelongsTo { return $this->belongsTo(Guardian::class); }
    public function grade(): BelongsTo { return $this->belongsTo(Grade::class); }
    public function section(): BelongsTo { return $this->belongsTo(Section::class); }
    public function bus(): BelongsTo { return $this->belongsTo(Bus::class); }
    public function year(): BelongsTo { return $this->belongsTo(AcademicYear::class, 'academic_year_id'); }
    public function items(): HasMany { return $this->hasMany(ContractItem::class); }
    public function installments(): HasMany { return $this->hasMany(Installment::class)->orderBy('seq'); }
    public function payments(): HasMany { return $this->hasMany(Voucher::class, 'source_id')->where('source_type', 'contract')->orderByDesc('id'); }
}
