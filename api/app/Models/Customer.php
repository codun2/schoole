<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends TenantModel
{
    public function invoices(): HasMany { return $this->hasMany(ServiceInvoice::class); }
}
