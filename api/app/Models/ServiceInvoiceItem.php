<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Line item — tenancy is inherited from its parent document. */
class ServiceInvoiceItem extends Model
{
    protected $guarded = ['id', 'created_at', 'updated_at'];

}
