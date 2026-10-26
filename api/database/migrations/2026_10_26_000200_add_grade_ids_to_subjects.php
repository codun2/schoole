<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('subjects', 'grade_ids')) {
            Schema::table('subjects', function (Blueprint $t) {
                $t->json('grade_ids')->nullable()->after('grade_id'); // null/[] = applies to all grades
            });
        }
        // carry the old single grade into the new multi-grade column
        DB::statement("UPDATE subjects SET grade_ids = JSON_ARRAY(grade_id) WHERE grade_id IS NOT NULL AND grade_ids IS NULL");
    }

    public function down(): void
    {
        if (Schema::hasColumn('subjects', 'grade_ids')) {
            Schema::table('subjects', fn (Blueprint $t) => $t->dropColumn('grade_ids'));
        }
    }
};
