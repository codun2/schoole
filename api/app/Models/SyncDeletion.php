<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Tombstone written whenever a tenant record is deleted (see TenantModel::booted),
 * so the admin's offline mirror can drop the row on its next delta sync.
 */
class SyncDeletion extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $casts = ['deleted_at' => 'datetime'];
}
