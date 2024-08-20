import { CodeSystem, CodeSystemConcept, ValueSet, ValueSetComposeInclude } from 'fhir/r5';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

/**
 * Convert a CodeSystem to a ValueSet.
 *
 * @param options - The options for converting the CodeSystem to a ValueSet.
 * @returns The generated ValueSet.
 * @throws Error if the CodeSystem does not have at least one concept.
 * 
 * @author Ashley Peake
 */
function codeSystemToValueSet(options: {
    jsonFile: string;
    status: "draft" | "active" | "retired" | "unknown";
    url?: string;
    name?: string;
    description?: string;
    id?: string;
    [key: string]: any; // Add index signature
}): ValueSet {
    // Read the JSON file
    const codeSystem: CodeSystem = require(options.jsonFile);
    // Fill in the missing properties if not provided using the CodeSystem properties
    for (const property in options) {
        if (options.hasOwnProperty(property) && !options[property] && options.codeSystem.hasOwnProperty(property)) {
            // @ts-ignore - Ignore the error as we know the property exists
            options[property] = options.codeSystem[property];
        }
    }

    // Check if the CodeSystem has at least one concept
    if (!options.codeSystem.concept) {
        throw new Error('CodeSystem must have at least one concept');
    }

    // Create a new ValueSet object
    const valueSet: ValueSet = {
        resourceType: 'ValueSet',
        id: options.id,
        url: options.url,
        name: options.name,
        description: options.description,
        status: options.status,
        compose: {
            include: [
                {
                    system: options.codeSystem.url,
                    concept: options.codeSystem.concept.map((concept: CodeSystemConcept) => ({
                        code: concept.code,
                        display: concept.display,
                        definition: concept.definition, // Optional
                    })),
                },
            ],
        },
    };

    // Return the generated ValueSet
    return valueSet;
}

/**
 * Convert a CSV file to a FHIR ValueSet.
 */
function csvToValueSet(options: {
    csvFile: string;
    status: "draft" | "active" | "retired" | "unknown";
    url?: string;
    name?: string;
    description?: string;
    id?: string;
}): ValueSet {
    // Read the CSV file
    const csv = fs.readFileSync(options.csvFile, 'utf8');
    const lines: string[] = csv.split('\n');

    // Parse the CSV file into a ValueSet
    const include: ValueSetComposeInclude[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const [code, system, display] = line.split(',');
        // Ignore empty lines
        if (!code) { continue; }
        // check if include has a system and add to that group
        const systemIndex = include.findIndex((group) => group.system === system);
        if (systemIndex !== -1) {
            if (!include[systemIndex].concept) {
                include[systemIndex].concept = [];
            }
            // Add the concept to the system group
            include[systemIndex].concept?.push({ code, display });
        } else {
            // Add a new system group
            include.push({
                system,
                concept: [{ code, display }],
            });
        }
    }

    // Create a new ValueSet object
    const id = options.id || path.basename(options.csvFile).replace(/\.csv$/, '');
    const valueSet: ValueSet = {
        resourceType: 'ValueSet',
        id,
        url: options.url || `http://hl7.org/fhir/ValueSet/${id}`,
        name: options.name || id,
        description: options.description,
        status: options.status || 'active',
        compose: {
            include: include,
        },
    };

    // Return the generated ValueSet
    return valueSet;
}

program.version('0.0.1');
program.command('convert')
    .description('Convert CodeSystem to ValueSet')
    .argument('<file>', 'Path to CodeSystem JSON file')
    .option('-o, --output [file]', 'Output file path')
    .option('-u, --url <url>', 'ValueSet URL')
    .option('-n, --name <name>', 'ValueSet name')
    .option('-d, --description <description>', 'ValueSet description')
    .option('-i, --id <id>', 'ValueSet id')
    .option('-s, --status <status>', 'ValueSet status', 'draft')
    .action((file, options) => {
        // Check if JSON or CSV
        let valueSet: ValueSet;
        if (file.endsWith('.csv')) {
            valueSet = csvToValueSet({
                csvFile: file,
                status: options.status,
                url: options.url,
                name: options.name,
                description: options.description,
                id: options.id
            });
        } else {
            valueSet = codeSystemToValueSet({
                jsonFile: file,
                status: options.status,
                url: options.url,
                name: options.name,
                description: options.description,
                id: options.id,
            });
        }
        const jsonStr = JSON.stringify(valueSet, null, 2);
        // Write to file
        if (options.output) {
            // if output is flag only use the input file with a .json extension
            let outFile = options.output;
            if (typeof options.output == 'boolean') {
                outFile = file.replace(/\.json$/, '-value-set.json');
                outFile = outFile.replace(/\.csv$/, '.json');
            }
            fs.writeFileSync(outFile, jsonStr);
        } else {
            console.log(jsonStr);
        }
    });

program.parse();
