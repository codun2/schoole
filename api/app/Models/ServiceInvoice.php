<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceInvoice extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d', 'due_date' => 'date:Y-m-d', 'subtotal' => 'decimal:3', 'discount' => 'decimal:3', 'tax' => 'decimal:3', 'total' => 'decimal:3', 'paid' => 'decimal:3', 'tax_rate' => 'decimal:2'];
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function items(): HasMany { return $this->hasMany(ServiceInvoiceItem::class); }
    public function payments(): HasMany { return $this->hasMany(Voucher::class, 'source_id')->where('source_type', 'service_invoice')->orderByDesc('id'); }
}
