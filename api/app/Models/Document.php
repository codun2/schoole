<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Document extends TenantModel
{
    public function uploader(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
