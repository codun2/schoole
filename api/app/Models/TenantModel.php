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
}
