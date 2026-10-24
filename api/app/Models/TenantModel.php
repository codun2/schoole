<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

/**
 * Base for every school-owned record: automatically scoped to the current
 * school (company_id) and stamped on create. Mass-assignment is open except
 * for identity columns — controllers only ever pass validated input.
 */
abstract class TenantModel extends Model
{
    use BelongsToCompany;

    protected $guarded = ['id', 'company_id', 'created_at', 'updated_at'];

    protected static function booted(): void
    {
        // Tombstone every delete so the admin's offline mirror (GET /app/sync) can drop the row too.
        static::deleted(function (Model $model) {
            if ($model->getAttribute('company_id') === null) {
                return;
            }
            try {
                SyncDeletion::query()->insert([
                    'company_id' => $model->getAttribute('company_id'),
                    'table'      => $model->getTable(),
                    'row_id'     => $model->getKey(),
                    'deleted_at' => now(),
                ]);
            } catch (\Throwable $e) {
                report($e); // a tombstone problem must never break the delete itself
            }
        });
    }
}
