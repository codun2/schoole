<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subject extends TenantModel
{
    protected $casts = ['max_mark' => 'decimal:2', 'pass_mark' => 'decimal:2', 'grade_ids' => 'array'];

    public function grade(): BelongsTo
    {
        return $this->belongsTo(Grade::class);
    }

    /** A subject with no grade_ids applies to every grade; otherwise only to the listed ones. */
    public function appliesToGrade($gradeId): bool
    {
        return empty($this->grade_ids) || in_array((int) $gradeId, array_map('intval', $this->grade_ids), true);
    }
}
