<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A remembered write response, keyed per user by the client's Idempotency-Key (see IdempotencyKey middleware). */
class IdempotencyKey extends Model
{
    public $timestamps = false;

    protected $guarded = [];
}
