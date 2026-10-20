<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Line of an evaluation — tenancy inherited from its parent. */
class EvaluationScore extends Model
{
    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = ['score' => 'decimal:2'];
}
