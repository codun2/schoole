<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('guardians', 'name_en')) {
            Schema::table('guardians', fn (Blueprint $t) => $t->string('name_en')->nullable()->after('name'));
        }
        Schema::table('applications', function (Blueprint $t) {
            if (! Schema::hasColumn('applications', 'student_name_en')) {
                $t->string('student_name_en')->nullable()->after('student_name');
            }
            if (! Schema::hasColumn('applications', 'guardian_name_en')) {
                $t->string('guardian_name_en')->nullable()->after('guardian_name');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('guardians', 'name_en')) {
            Schema::table('guardians', fn (Blueprint $t) => $t->dropColumn('name_en'));
        }
        Schema::table('applications', function (Blueprint $t) {
            foreach (['student_name_en', 'guardian_name_en'] as $c) {
                if (Schema::hasColumn('applications', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }
};
