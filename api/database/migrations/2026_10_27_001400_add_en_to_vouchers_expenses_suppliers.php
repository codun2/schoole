<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('vouchers', function (Blueprint $t) {
            if (! Schema::hasColumn('vouchers', 'description_en')) $t->string('description_en')->nullable()->after('description');
            if (! Schema::hasColumn('vouchers', 'party_name_en')) $t->string('party_name_en')->nullable()->after('party_name');
        });
        if (! Schema::hasColumn('expenses', 'description_en')) Schema::table('expenses', fn (Blueprint $t) => $t->string('description_en')->nullable()->after('description'));
        if (! Schema::hasColumn('suppliers', 'contact_person_en')) Schema::table('suppliers', fn (Blueprint $t) => $t->string('contact_person_en')->nullable()->after('contact_person'));
    }
    public function down(): void {
        Schema::table('vouchers', function (Blueprint $t) {
            foreach (['description_en', 'party_name_en'] as $c) if (Schema::hasColumn('vouchers', $c)) $t->dropColumn($c);
        });
        if (Schema::hasColumn('expenses', 'description_en')) Schema::table('expenses', fn (Blueprint $t) => $t->dropColumn('description_en'));
        if (Schema::hasColumn('suppliers', 'contact_person_en')) Schema::table('suppliers', fn (Blueprint $t) => $t->dropColumn('contact_person_en'));
    }
};
