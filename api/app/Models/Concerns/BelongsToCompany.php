<?php

namespace App\Models\Concerns;

use App\Models\Company;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Multi-tenant scoping. Any model using this trait is automatically:
 *   - filtered to the current school on every query, and
 *   - stamped with the current company_id on create.
 *
 * The "current company" is bound into the container as `currentCompanyId` by
 * the SetCompanyContext middleware (from the authenticated user's company_id).
 * When nothing is bound (console, public endpoints) or it is null (platform
 * super-admin), the scope is disabled and the model behaves globally.
 */
trait BelongsToCompany
{
    protected static function bootBelongsToCompany(): void
    {
        static::addGlobalScope('company', function (Builder $builder) {
            if (self::currentCompanyId() !== null) {
                $builder->where($builder->getModel()->getTable().'.company_id', self::currentCompanyId());
            }
        });

        static::creating(function (Model $model) {
            if ($model->getAttribute('company_id') === null && self::currentCompanyId() !== null) {
                $model->setAttribute('company_id', self::currentCompanyId());
            }
        });
    }

    /** The company context for the current request, or null when unscoped. */
    protected static function currentCompanyId(): ?int
    {
        return app()->bound('currentCompanyId') ? app('currentCompanyId') : null;
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
