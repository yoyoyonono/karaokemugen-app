import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Col, Divider, Form, Input, Layout, Row, Select, Table, Tooltip } from 'antd';
import { Component, createRef } from 'react';
import Title from '../../components/Title';

import i18next from 'i18next';
import { ImportBaseFile } from '../../../../../src/types/repo';
import { commandBackend } from '../../../utils/socket';
import FoldersElement from '../../components/FoldersElement';
import { FormInstance } from 'antd/lib';

interface KaraImportState {
	sourceDir: string;
	fileNameTemplate: string;
	filesToImport: any[];
	importRunning: boolean;
	// old
	repositories: string[];
	destinationRepository: string;
	type?: 'tags' | 'medias';
	tagType?: number;
}

class KaraImport extends Component<unknown, KaraImportState> {
	formRef = createRef<FormInstance>();

	state = {
		sourceDir: '',
		fileNameTemplate: '{title}',
		filesToImport: [],
		importRunning: false,
		// old
		repositories: [],
		destinationRepository: null,
		type: undefined,
		tagType: undefined,
	};

	async findFilesToImport(options?: { sourceDir?: string; fileNameTemplate?: string }) {
		if (options?.sourceDir) this.setState({ sourceDir: options.sourceDir });
		if (options?.fileNameTemplate) this.setState({ fileNameTemplate: options.fileNameTemplate });
		const res: ImportBaseFile[] = await commandBackend('findFilesToImport', {
			dirname: options?.sourceDir || this.state.sourceDir,
			template: options?.fileNameTemplate || this.state.fileNameTemplate,
		});
		this.setState({ filesToImport: res.map(r => ({ ...r.newFile, ...r })) });
	}

	async startImportBase() {
		this.setState({ importRunning: true });
		const options: { source: string; template: string; type: 'file' | 'dir'; repoDest: string } = {
			repoDest: this.state.destinationRepository,
			source: this.state.sourceDir,
			template: this.state.fileNameTemplate,
			type: 'dir',
		};
		await commandBackend('importBase', options);
		this.setState({ importRunning: false });
	}

	componentDidMount() {
		this.refresh();
	}

	refresh = async () => {
		const res = (await commandBackend('getRepos')).filter(r => r.MaintainerMode || !r.Online);
		if (res.length > 0) {
			this.setState({ destinationRepository: res[0].Name, repositories: res.map(value => value.Name) });
			this.formRef.current.setFieldsValue({ destinationRepository: res[0].Name });
		}
	};

	render() {
		return (
			<>
				<Title
					title={i18next.t('HEADERS.KARAOKE_IMPORT.TITLE')}
					description={i18next.t('HEADERS.KARAOKE_IMPORT.DESCRIPTION')}
				/>
				<Divider orientation="left">{i18next.t('KARAOKE_IMPORT.CONFIGURATION')}</Divider>
				<Layout.Content style={{ paddingRight: '5em', paddingLeft: '110px' }}>
					<Form style={{ maxWidth: '900px' }} initialValues={{ ...this.state }} ref={this.formRef}>
						<Form.Item
							label={
								<span>
									{i18next.t('KARAOKE_IMPORT.SOURCE_DIR')}
									&nbsp;
									<Tooltip title={i18next.t('KARAOKE_IMPORT.SOURCE_DIR_TOOLTIP')}>
										<QuestionCircleOutlined />
									</Tooltip>
								</span>
							}
							name="sourceDir"
						>
							<FoldersElement
								openDirectory={true}
								onChange={value => this.findFilesToImport({ sourceDir: value })}
							/>
						</Form.Item>

						<Form.Item
							label={
								<span>
									{i18next.t('KARAOKE_IMPORT.DESTINATION_REPOSITORY')}
									&nbsp;
									<Tooltip title={i18next.t('KARAOKE_IMPORT.DESTINATION_REPOSITORY_TOOLTIP')}>
										<QuestionCircleOutlined />
									</Tooltip>
								</span>
							}
							name="destinationRepository"
						>
							<Select style={{ width: 150 }} defaultValue={this.state.destinationRepository}>
								{this.state.repositories.map(repo => {
									return (
										<Select.Option key={repo} value={repo}>
											{repo}
										</Select.Option>
									);
								})}
							</Select>
						</Form.Item>

						<Form.Item
							label={
								<span>
									{i18next.t('KARAOKE_IMPORT.FILENAME_TEMPLATE')}
									&nbsp;
									<Tooltip title={i18next.t('KARAOKE_IMPORT.FILENAME_TEMPLATE_TOOLTIP')}>
										<QuestionCircleOutlined />
									</Tooltip>
								</span>
							}
							name="fileNameTemplate"
						>
							<Input
								value={this.state.fileNameTemplate}
								onChange={event =>
									this.findFilesToImport({ fileNameTemplate: event.currentTarget.value })
								}
							/>
						</Form.Item>
					</Form>
				</Layout.Content>
				<Divider orientation="left">{i18next.t('KARAOKE_IMPORT.MEDIA_FILES')}</Divider>
				<Layout.Content style={{ paddingRight: '5em', paddingLeft: '110px' }}>
					<Row>
						<Col>
							<Table dataSource={this.state.filesToImport} columns={this.columns} rowKey="oldFile" />
						</Col>
					</Row>
				</Layout.Content>
				<Divider orientation="left">{i18next.t('KARAOKE_IMPORT.IMPORT')}</Divider>
				<Layout.Content style={{ paddingRight: '5em', paddingLeft: '110px' }}>
					<Row>
						<Col>
							<Button type="primary" onClick={() => this.startImportBase()}>
								{i18next.t('KARAOKE_IMPORT.IMPORT_START')}
							</Button>
						</Col>
					</Row>
				</Layout.Content>
			</>
		);
	}

	columns = [
		{
			title: 'Source',
			dataIndex: 'oldFile',
			sorter: (a, b) => a.oldFile.localeCompare(b.oldFile),
			defaultSortOrder: 'ascend' as const,
		},
		{
			title: 'Title',
			dataIndex: 'title',
		},
		{
			title: 'Year',
			dataIndex: 'year',
		},
	];
}

export default KaraImport;
